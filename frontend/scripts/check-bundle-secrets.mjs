#!/usr/bin/env node
/**
 * Fails the build if server-only material reached the browser bundle.
 *
 * Under Next these values were protected by `server-only` imports and the
 * route/component split. Vite's VITE_ prefix rule is the equivalent guardrail,
 * but nothing fails loudly when it is bypassed — so this asserts it. Run in CI
 * before every deploy.
 *
 * Two passes, because they catch different mistakes:
 *
 *   names   an env var read that Vite could not inline, e.g. someone writing
 *           import.meta.env.SUPABASE_SERVICE_ROLE_KEY. Emitted assets only —
 *           third-party sources legitimately mention "service_role" in their
 *           own docs and type names.
 *   values  an actual secret hard-coded or inlined. Scanned across every
 *           emitted file including sourcemaps, since a map embeds full source.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const SECRET_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_REALTIMEKIT_APP_ID",
];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Secret values from the local env files, so we can look for the real thing. */
function secretValues() {
  const values = [];
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.+)$/.exec(line.trim());
      if (!match) continue;
      const [, name, raw] = match;
      const value = raw.replace(/^["']|["']$/g, "").trim();
      if (SECRET_VARS.includes(name) && value.length >= 8)
        values.push({ name, value });
    }
  }
  for (const name of SECRET_VARS) {
    const value = process.env[name];
    if (value && value.length >= 8) values.push({ name, value });
  }
  return values;
}

if (!existsSync("dist")) {
  console.error("  dist/ not found — run the build first.");
  process.exit(1);
}

const all = walk("dist");
const emitted = all.filter((f) => /\.(js|css|html)$/.test(f));
const values = secretValues();
const findings = [];

for (const file of emitted) {
  const content = readFileSync(file, "utf8");
  for (const name of SECRET_VARS)
    if (content.includes(name)) findings.push(`${name} (name) -> ${file}`);
}

for (const file of all.filter((f) => /\.(js|css|html|map)$/.test(f))) {
  const content = readFileSync(file, "utf8");
  for (const { name, value } of values)
    if (content.includes(value)) findings.push(`${name} (VALUE) -> ${file}`);
}

if (findings.length) {
  console.error("\n  Server-only material found in the browser bundle:\n");
  for (const line of findings) console.error(`    ${line}`);
  console.error("");
  process.exit(1);
}

console.log(
  `  Bundle clean: ${emitted.length} emitted files scanned for ${SECRET_VARS.length} secret names, ` +
    `${all.length} files scanned for ${values.length} configured secret value(s).`,
);
