import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Next.js registers every export of a "use server" module as a Server
// Reference at runtime. A type-only re-export (`export type { X }` or
// `export { type X }`) has no runtime value, so the generated
// registerServerReference(X, ...) throws "ReferenceError: X is not defined"
// when the module loads — every call to every action in the file fails.
// This broke the newsletter subscribe form in production (Stage 4).
// Declaring a type (`export type X = ...`) is fine: it's erased entirely.

const TYPE_REEXPORT = /^[ \t]*export\s+(?:type\s*\{[^}]*\}|\{[^}]*\btype\s+\w+[^}]*\})[^;\n]*;?/m;
const USE_SERVER = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use server["']/;

function findTypeReexport(source: string): string | null {
  if (!USE_SERVER.test(source)) return null;
  return source.match(TYPE_REEXPORT)?.[0].trim() ?? null;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("\"use server\" modules: no type re-exports", () => {
  it("detects the pattern that broke the subscribe action", () => {
    const broken = `"use server";\nimport { run, type Result } from "./flow";\nexport type { Result };\nexport async function act() {}\n`;
    assert.equal(findTypeReexport(broken), "export type { Result };");
    assert.ok(findTypeReexport(`'use server'\nexport { type Result };`));
    assert.ok(findTypeReexport(`// comment\n"use server";\nexport type { A, B } from "./x";`));
  });

  it("allows normal server action exports and type declarations", () => {
    const fine = `"use server";\nimport { run, type Result } from "./flow";\nexport type Local = { ok: boolean };\nexport async function act(): Promise<Result> { return run(); }\n`;
    assert.equal(findTypeReexport(fine), null);
  });

  it("ignores files that aren't \"use server\" modules", () => {
    assert.equal(findTypeReexport(`import type { A } from "./a";\nexport type { A };`), null);
    assert.equal(findTypeReexport(`"use client";\nexport type { A } from "./a";`), null);
  });

  it("finds no type re-export in any \"use server\" file of the app", () => {
    const root = process.cwd();
    const offenders = ["app", "lib", "components"]
      .flatMap((dir) => sourceFiles(join(root, dir)))
      .map((file) => ({ file: relative(root, file), match: findTypeReexport(readFileSync(file, "utf8")) }))
      .filter((entry) => entry.match !== null);
    assert.deepEqual(offenders, []);
  });
});
