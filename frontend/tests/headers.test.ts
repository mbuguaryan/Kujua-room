// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Under Next these headers came from next.config.ts and could not be forgotten.
 * On static hosting they are a config file, and nothing fails when it is
 * missing or drifts — so the contents are asserted here instead. If you add a
 * directive to one file, add it to the other.
 */
const headersFile = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");
const nginxFile = readFileSync(resolve(process.cwd(), "deploy/nginx-headers.conf"), "utf8");

const REQUIRED = [
  "Content-Security-Policy",
  "Referrer-Policy",
  "Permissions-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Cross-Origin-Opener-Policy",
  "Strict-Transport-Security",
];

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
];

describe("security headers", () => {
  it.each(REQUIRED)("declares %s in both host configs", (header) => {
    expect(headersFile).toContain(header);
    expect(nginxFile).toContain(header);
  });

  it.each(CSP_DIRECTIVES)("keeps the %s CSP directive", (directive) => {
    expect(headersFile).toContain(directive);
    expect(nginxFile).toContain(directive);
  });

  it("still restricts the microphone to same-origin", () => {
    expect(headersFile).toContain("microphone=(self)");
    expect(nginxFile).toContain("microphone=(self)");
  });

  it("allows Supabase over https and websockets for realtime", () => {
    expect(headersFile).toContain("https://*.supabase.co");
    expect(headersFile).toContain("wss://*.supabase.co");
  });

  it("does not weaken script-src with unsafe-eval", () => {
    expect(headersFile).not.toContain("'unsafe-eval'");
    expect(nginxFile).not.toContain("'unsafe-eval'");
  });
});
