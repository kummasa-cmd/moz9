/**
 * SNS 콘텐츠 LAB — Stage 6-D3b: admin session security report (admin-session-v2, wired).
 *
 *   npx tsx scripts/sns-lab/admin-session-report.ts [--out-dir=docs/sns-lab-stage6d3b] [--check]
 *
 * FAKE secrets, FAKE admin ids, fixed clock. Writes
 * <out-dir>/admin-session-v2-security-report.json — no secret, no token
 * (sha256 prefixes only). No database, no network, no route, no AI provider,
 * no environment variable read. Deterministic (--check). The Stage 6-D2
 * report (docs/sns-lab-stage6d2, v2 not yet wired) is kept as a historical artifact.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildAdminSessionReport } from "@/lib/admin-session/report";

async function main(): Promise<number> {
  const outDir = process.argv.find((a) => a.startsWith("--out-dir="))?.slice("--out-dir=".length) ?? join("docs", "sns-lab-stage6d3b");
  const check = process.argv.includes("--check");
  const { report, digest } = await buildAdminSessionReport();
  const s = report.summary;
  console.log(`${report.version} · stage ${report.stage} · asOf ${report.asOf} · digest ${digest.slice(0, 12)}`);
  console.log(`adversarial blocked ${s.blocked}/${s.adversarialCases} · secrets in report ${s.secretsInReport}`);
  for (const c of report.adversarial) console.log(`  ${c.blocked ? "blocked " : "ALLOWED!"} ${c.id.padEnd(40)} ${c.outcome}`);
  console.log(`compatibility ${JSON.stringify(report.compatibility)}`);
  const path = join(outDir, "admin-session-v2-security-report.json");
  const text = JSON.stringify(report, null, 1) + "\n";
  if (check) {
    const same = existsSync(path) && readFileSync(path, "utf8").replace(/\r\n/g, "\n") === text;
    console.log(`${same ? "✔ same" : "✖ DRIFT"}  ${path}`);
    return same && s.notBlocked.length === 0 ? 0 : 1;
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path, text);
  console.log(`wrote ${path}`);
  return s.notBlocked.length === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
