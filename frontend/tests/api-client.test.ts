// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The API moved to another origin, so every call must go through apiFetch,
 * which prefixes VITE_API_BASE_URL and attaches the bearer token.
 *
 * A raw same-origin fetch does not fail loudly: the Vite dev server answers
 * every unknown path with index.html, so the caller gets HTML and dies on
 * `Unexpected token '<'` far from the cause. Eight multi-line calls in
 * RoomScreen survived the migration exactly this way — the room never
 * connected, and the visible symptom was silent microphones.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const root = process.cwd();
const sources = ["components", "hooks", "src", "lib"]
  .flatMap((dir) => walk(resolve(root, dir)))
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => !file.endsWith(join("lib", "api.ts")))
  .map((file) => ({ file: file.replace(`${root}/`, ""), body: readFileSync(file, "utf8") }));

describe("api client", () => {
  it("routes every call through apiFetch", () => {
    const offenders = sources
      .filter(({ body }) => /(?<!api)\bfetch\s*\(/.test(body))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("leaves no same-origin /api/ paths behind", () => {
    const offenders = sources
      .filter(({ body }) => /["'`]\/api\//.test(body))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("sends the bearer token and never cookies", () => {
    const api = readFileSync(resolve(root, "lib/api.ts"), "utf8");
    expect(api).toContain("Authorization");
    expect(api).toContain('credentials: "omit"');
  });
});
