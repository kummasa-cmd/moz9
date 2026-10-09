import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

// Entry-point policy registry (Stage 6-D3a).
//
// Every Server Action module ("use server") and every route handler in app/
// must appear below with an auth policy. For admin Server Actions the FIRST
// statement of every exported function must be `await requireAdmin(...)`
// imported from lib/admin-guard (or the SNS LAB guard, which delegates to
// it); admin route handlers must start with requireAdminForRoute(). A new
// action, export or route without an entry — or an entry whose guard is
// missing — fails `npm test`.
//
// Permission category = what the action does. The project has one admin tier
// (admins.role is stored but never enforced), so every admin category needs
// exactly "authenticated, existing admin" — this registry does not widen or
// narrow that. SNS LAB verification approve/issue are NOT admin categories:
// they need explicit server-side grants (lib/sns-lab/authority).

type Category = "read" | "update" | "delete" | "send" | "user-management" | "upload" | "sns-lab";

const ADMIN_ACTIONS: Record<string, Record<string, Category>> = {
  "app/admin/(protected)/consulting/actions.ts": { replyConsultation: "update" },
  "app/admin/(protected)/consulting/inquiry/actions.ts": { replyInquiry: "update" },
  "app/admin/(protected)/consulting/partner/actions.ts": { replyPartnerPost: "update", updatePartnerPostStatus: "update", updatePartnerComment: "update", deletePartnerComment: "delete" },
  "app/admin/(protected)/members/actions.ts": { createMember: "user-management", updateMember: "user-management", deleteMember: "user-management", deleteMembers: "user-management" },
  "app/admin/(protected)/orders/actions.ts": { searchVendors: "read", createOrder: "update", updateOrder: "update", deleteOrder: "delete" },
  "app/admin/(protected)/orders/vendors/actions.ts": { searchPartnerMembers: "read", createVendor: "update", updateVendor: "update", deleteVendor: "delete" },
  "app/admin/(protected)/portfolio/actions.ts": { createPortfolioItem: "update", updatePortfolioItem: "update", deletePortfolioItem: "delete" },
  "app/admin/(protected)/products/actions.ts": { createProduct: "update" },
  "app/admin/(protected)/site/admins/actions.ts": { createAdmin: "user-management", updateAdmin: "user-management", deleteAdmin: "user-management" },
  "app/admin/(protected)/site/board/actions.ts": { createBoard: "update", updateBoard: "update", deleteBoard: "delete" },
  "app/admin/(protected)/site/board/[id]/categories/actions.ts": { createCategory: "update", updateCategory: "update", deleteCategory: "delete" },
  "app/admin/(protected)/site/board/[id]/posts/actions.ts": { createBoardPost: "update", updateBoardPost: "update", deleteBoardPost: "delete", deleteBoardPosts: "delete" },
  "app/admin/(protected)/site/board/[id]/posts/[postId]/actions.ts": { addComment: "update", deleteComment: "delete" },
  "app/admin/(protected)/site/main/actions.ts": { updateSiteSettings: "update" },
  "app/admin/(protected)/site/newsletter/actions.ts": { deleteNewsletter: "delete", deleteNewsletters: "delete", cancelCampaign: "send", sendCampaignNow: "send" },
  "app/admin/(protected)/site/newsletter/banners/actions.ts": { createBanner: "update", updateBanner: "update", deleteBanner: "delete", deleteBanners: "delete" },
  "app/admin/(protected)/site/newsletter/manage/actions.ts": { saveNewsletterCampaign: "send" },
  "app/admin/(protected)/site/newsletter/manage/template-actions.ts": { saveNewsletterTemplate: "update", deleteNewsletterTemplate: "delete" },
  "app/admin/(protected)/site/newsletter/promo/actions.ts": { savePromoNewsletter: "send" },
  "app/admin/(protected)/site/newsletter/promo/targets/actions.ts": { addProspect: "user-management", bulkAddProspects: "user-management", deleteProspect: "user-management", deleteProspects: "user-management", deleteSuppression: "user-management", deleteSuppressions: "user-management" },
  "app/admin/(protected)/site/newsletter/subscribers/actions.ts": { addSubscriber: "user-management", bulkAddSubscribers: "user-management", setSubscriberStatus: "user-management", deleteSubscriber: "user-management", deleteSubscribers: "user-management" },
  "app/admin/(protected)/site/newsletter/subscribers/test-recipient-actions.ts": { addTestRecipient: "update", setTestRecipientActive: "update", deleteTestRecipient: "delete" },
};

/** SNS LAB actions (guarded by lib/sns-lab/guard.ts → lib/admin-guard). Checked when present. */
const SNS_LAB_ACTIONS: Record<string, Record<string, Category>> = {
  "app/admin/(protected)/sns-lab/import/actions.ts": { uploadThreadsExcel: "upload", runThreadsImport: "sns-lab" },
};

/** Non-admin Server Action modules: "public" (by design) or "member" (Supabase Auth user checked in the action). */
const SITE_ACTIONS: Record<string, "public" | "member"> = {
  "app/admin/login/actions.ts": "public",
  "app/(site)/community/[slug]/actions.ts": "member",
  "app/(site)/community/[slug]/[postId]/actions.ts": "member",
  "app/(site)/forgot-password/actions.ts": "public",
  "app/(site)/login/actions.ts": "public",
  "app/(site)/mypage/column/new/actions.ts": "member",
  "app/(site)/mypage/consultations/actions.ts": "member",
  "app/(site)/mypage/partner/actions.ts": "member",
  "app/(site)/mypage/profile/actions.ts": "member",
  "app/(site)/mypage/withdraw/actions.ts": "member",
  "app/(site)/newsletter/subscribe/actions.ts": "public",
  "app/(site)/register/actions.ts": "public",
  "app/(site)/reset-password/actions.ts": "member",
  "app/(site)/verify-email/actions.ts": "public",
};

type RoutePolicy = "admin" | "member-or-admin" | "cron" | "webhook" | "public" | "public-token";
/** Every route handler. `guard` = text the handler's first statement must contain. */
const ROUTES: Record<string, { policy: RoutePolicy; guard?: string; marker?: string }> = {
  "app/api/newsletter-image/route.ts": { policy: "admin", guard: "requireAdminForRoute(" },
  "app/api/portfolio-image/route.ts": { policy: "admin", guard: "requireAdminForRoute(" },
  "app/api/board-image/route.ts": { policy: "member-or-admin", guard: "canUploadBoardImage(" },
  "app/api/member-avatar/route.ts": { policy: "member-or-admin", marker: "checkAdmin()" },
  "app/api/cron/newsletter/health/route.ts": { policy: "cron", marker: "cronSecret" },
  "app/api/cron/newsletter/send-due/route.ts": { policy: "cron", marker: "cronSecret" },
  "app/api/cron/newsletter/sync-contacts/route.ts": { policy: "cron", marker: "cronSecret" },
  "app/api/webhooks/resend/route.ts": { policy: "webhook", marker: "svix" },
  "app/api/consultation/route.ts": { policy: "public" },
  "app/api/domain-check/route.ts": { policy: "public" },
  "app/api/newsletter/feedback/[newsletterId]/route.ts": { policy: "public-token" },
  "app/api/newsletter/post-feedback/[newsletterId]/route.ts": { policy: "public-token" },
  "app/api/track/click/[token]/route.ts": { policy: "public-token" },
  "app/api/track/open/[token]/route.ts": { policy: "public-token" },
  "app/auth/callback/route.ts": { policy: "public" },
  "app/auth/confirm/route.ts": { policy: "public" },
};

const ROOT = process.cwd();
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const GUARD_MODULES = new Set(["@/lib/admin-guard", "@/lib/sns-lab/guard"]);

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");
const parse = (p: string) => ts.createSourceFile(p, readFileSync(join(ROOT, p), "utf8").replace(/^﻿/, ""), ts.ScriptTarget.Latest, true);

function directives(stmts: ts.NodeArray<ts.Statement>): string[] {
  const out: string[] = [];
  for (const s of stmts) {
    if (ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression)) out.push(s.expression.text);
    else break;
  }
  return out;
}
const firstReal = (body: ts.Block) => body.statements.find((s) => !(ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression)));

function isAwaitedCall(stmt: ts.Statement | undefined, name: string): boolean {
  if (!stmt) return false;
  let expr: ts.Expression | undefined;
  if (ts.isExpressionStatement(stmt)) expr = stmt.expression;
  else if (ts.isVariableStatement(stmt) && stmt.declarationList.declarations.length === 1) expr = stmt.declarationList.declarations[0].initializer;
  if (!expr || !ts.isAwaitExpression(expr)) return false;
  const call = expr.expression;
  return ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === name;
}

function importSource(sf: ts.SourceFile, name: string): string | null {
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !s.importClause?.namedBindings || !ts.isNamedImports(s.importClause.namedBindings)) continue;
    if (s.importClause.namedBindings.elements.some((e) => e.name.text === name && !e.propertyName)) return (s.moduleSpecifier as ts.StringLiteral).text;
  }
  return null;
}

/** Exported functions of a module: name → body (function declarations and `export const x = async () => {}`). */
function exportedFunctions(sf: ts.SourceFile): Map<string, ts.Block | null> {
  const out = new Map<string, ts.Block | null>();
  const exported = (n: ts.Node) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && exported(s) && s.name) out.set(s.name.text, s.body ?? null);
    if (ts.isVariableStatement(s) && exported(s)) {
      for (const d of s.declarationList.declarations) {
        const init = d.initializer;
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) out.set(d.name.text, ts.isBlock(init.body) ? init.body : null);
        else if (ts.isIdentifier(d.name)) out.set(d.name.text, null);
      }
    }
    if (ts.isExportDeclaration(s) && !s.isTypeOnly && s.exportClause && ts.isNamedExports(s.exportClause)) {
      for (const e of s.exportClause.elements) if (!e.isTypeOnly) out.set(e.name.text, null);
    }
  }
  return out;
}

const useServerModules = () =>
  ["app", "components", "lib"].flatMap((d) => sourceFiles(join(ROOT, d))).map(rel).filter((p) => directives(parse(p).statements).includes("use server"));

describe("admin entry-point policy registry", () => {
  it("every \"use server\" module has a policy", () => {
    const known = new Set([...Object.keys(ADMIN_ACTIONS), ...Object.keys(SNS_LAB_ACTIONS), ...Object.keys(SITE_ACTIONS)]);
    assert.deepEqual(useServerModules().filter((p) => !known.has(p)), []);
  });

  it("the registry lists no stale admin module", () => {
    assert.deepEqual(Object.keys(ADMIN_ACTIONS).filter((p) => !existsSync(join(ROOT, p))), []);
    assert.deepEqual(Object.keys(SITE_ACTIONS).filter((p) => !existsSync(join(ROOT, p))), []);
  });

  for (const [file, exportsPolicy] of [...Object.entries(ADMIN_ACTIONS), ...Object.entries(SNS_LAB_ACTIONS)]) {
    it(`${file}: every export is registered and starts with await requireAdmin()`, (t) => {
      if (!existsSync(join(ROOT, file))) {
        assert.ok(file in SNS_LAB_ACTIONS, `${file} missing`);
        t.skip("SNS LAB module not present in this tree");
        return;
      }
      const sf = parse(file);
      const source = importSource(sf, "requireAdmin");
      assert.ok(source && GUARD_MODULES.has(source), `requireAdmin must come from lib/admin-guard (got ${source})`);
      const fns = exportedFunctions(sf);
      assert.deepEqual([...fns.keys()].sort(), Object.keys(exportsPolicy).sort(), "exports ↔ registry");
      for (const [name, body] of fns) {
        assert.ok(body, `${name}: must be a function with a block body`);
        assert.ok(isAwaitedCall(firstReal(body), "requireAdmin"), `${name}: first statement must be await requireAdmin()`);
      }
    });
  }

  it("member Server Action modules check the Supabase Auth user", () => {
    const offenders = Object.entries(SITE_ACTIONS)
      .filter(([, policy]) => policy === "member")
      .filter(([p]) => !/auth\.getUser\(/.test(readFileSync(join(ROOT, p), "utf8")))
      .map(([p]) => p);
    assert.deepEqual(offenders, []);
  });

  it("no inline \"use server\" function exists outside the registered modules", () => {
    const offenders: string[] = [];
    for (const p of ["app", "components"].flatMap((d) => sourceFiles(join(ROOT, d))).map(rel)) {
      const sf = parse(p);
      const visit = (n: ts.Node) => {
        if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) && n.body && ts.isBlock(n.body) && directives(n.body.statements).includes("use server")) {
          offenders.push(`${p}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    assert.deepEqual(offenders, []);
  });
});

describe("route handler policy registry", () => {
  const routes = ["app"].flatMap((d) => sourceFiles(join(ROOT, d))).map(rel).filter((p) => /\/route\.ts$/.test(p));

  it("every route handler has a policy, and no entry is stale", () => {
    assert.deepEqual(routes.filter((p) => !(p in ROUTES)), []);
    assert.deepEqual(Object.keys(ROUTES).filter((p) => !existsSync(join(ROOT, p))), []);
  });

  it("there is no route handler under /admin", () => {
    assert.deepEqual(routes.filter((p) => p.startsWith("app/admin/")), []);
  });

  for (const [file, rule] of Object.entries(ROUTES)) {
    if (!rule.guard && !rule.marker) continue;
    it(`${file} (${rule.policy})`, () => {
      const sf = parse(file);
      const src = sf.getFullText();
      if (rule.marker) assert.ok(src.includes(rule.marker), `${file} must contain ${rule.marker}`);
      if (!rule.guard) return;
      const fns = exportedFunctions(sf);
      const handlers = [...fns.keys()].filter((n) => HTTP_METHODS.has(n));
      assert.ok(handlers.length > 0);
      for (const name of handlers) {
        const body = fns.get(name);
        assert.ok(body, name);
        const first = firstReal(body);
        assert.ok(first && first.getText().includes(rule.guard), `${file} ${name}: first statement must call ${rule.guard}`);
      }
    });
  }
});
