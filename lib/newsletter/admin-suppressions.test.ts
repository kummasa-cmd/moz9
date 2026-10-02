import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { adminDeleteSuppressions, blockedSuppressionMessage } from "./admin-suppressions";

// The rule lives in newsletter_admin_delete_suppressions (tested against
// Postgres in subscription-sql.test.ts). Here: the wrapper only ever calls
// that function, and no runtime code deletes suppressions directly.

function rpcDb(reply: { data: unknown; error: { message: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return reply;
    },
    from: () => {
      throw new Error("suppressions must not be deleted through the table API");
    },
  };
  return { db: db as never, calls };
}

describe("adminDeleteSuppressions", () => {
  it("passes the (deduplicated) ids to the SQL function and maps the counts", async () => {
    const { db, calls } = rpcDb({ data: [{ deleted: 1, blocked: 2, not_found: 0 }], error: null });
    const result = await adminDeleteSuppressions(db, ["a", "b", "a", " ", "c"]);
    assert.deepEqual(result, { ok: true, deleted: 1, blocked: 2, notFound: 0 });
    assert.deepEqual(calls, [{ fn: "newsletter_admin_delete_suppressions", args: { p_ids: ["a", "b", "c"] } }]);
  });

  it("a direct / stale action call with a protected id is refused by the function, not the UI", async () => {
    const { db } = rpcDb({ data: { deleted: 0, blocked: 1, not_found: 0 }, error: null });
    const result = await adminDeleteSuppressions(db, ["sup-complaint"]);
    assert.deepEqual(result, { ok: true, deleted: 0, blocked: 1, notFound: 0 });
    assert.match(blockedSuppressionMessage(1), /1건은 해제할 수 없습니다/);
  });

  it("a missing function (0031 not applied) deletes nothing — no table fallback", async () => {
    const { db, calls } = rpcDb({ data: null, error: { message: "function public.newsletter_admin_delete_suppressions does not exist" } });
    const result = await adminDeleteSuppressions(db, ["x"]);
    assert.equal(result.ok, false);
    assert.equal(calls.length, 1);
  });

  it("no ids → no call; an unreadable reply is an error", async () => {
    const empty = rpcDb({ data: null, error: null });
    assert.deepEqual(await adminDeleteSuppressions(empty.db, []), { ok: true, deleted: 0, blocked: 0, notFound: 0 });
    assert.equal(empty.calls.length, 0);
    assert.equal((await adminDeleteSuppressions(rpcDb({ data: [{ deleted: "x" }], error: null }).db, ["a"])).ok, false);
  });
});

// Repository guard: production runtime code (app/, lib/, scripts/) must
// never delete newsletter_suppressions rows through the table API — every
// removal goes through a SQL function that checks the reason
// (newsletter_subscribe / newsletter_admin_set_status /
// newsletter_admin_delete_suppressions). Tests and migrations are exempt.
describe("no direct newsletter_suppressions deletes in runtime code", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("finds none", () => {
    const root = process.cwd();
    const offenders: string[] = [];
    for (const file of ["app", "lib", "scripts"].flatMap((d) => sourceFiles(join(root, d)))) {
      const text = readFileSync(file, "utf8");
      // A from("newsletter_suppressions") chain that reaches .delete( before
      // the statement ends.
      for (const match of text.matchAll(/from\(\s*["']newsletter_suppressions["']\s*\)[^;]*?\.delete\(/g)) {
        offenders.push(`${relative(root, file)}@${match.index}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("would catch the old promo action", () => {
    const old = 'await supabase.from("newsletter_suppressions").delete().in("id", ids);';
    assert.match(old, /from\(\s*["']newsletter_suppressions["']\s*\)[^;]*?\.delete\(/);
  });
});
