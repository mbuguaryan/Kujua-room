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
/* Vercel reads neither of the two files above: `public/_headers` is a Netlify
   and Cloudflare Pages convention, and it is ignored here silently. The same
   headers therefore have to be restated in vercel.json, which is the third
   copy this suite exists to keep honest. */
const vercelFile = readFileSync(resolve(process.cwd(), "vercel.json"), "utf8");

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
  it.each(REQUIRED)("declares %s in all three host configs", (header) => {
    expect(headersFile).toContain(header);
    expect(nginxFile).toContain(header);
    expect(vercelFile).toContain(header);
  });

  it.each(CSP_DIRECTIVES)("keeps the %s CSP directive", (directive) => {
    expect(headersFile).toContain(directive);
    expect(nginxFile).toContain(directive);
    expect(vercelFile).toContain(directive);
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
    expect(vercelFile).not.toContain("'unsafe-eval'");
  });

  /* Next.js served every route; a static SPA does not. Without this rewrite
     /join, /host/login and /r/:slug all 404 on a direct load or a refresh. */
  it("falls every unknown path back to the SPA entry point", () => {
    const config = JSON.parse(vercelFile) as {
      rewrites?: { destination: string }[];
      outputDirectory?: string;
    };
    expect(config.rewrites?.[0]?.destination).toBe("/index.html");
    expect(config.outputDirectory).toBe("dist");
  });
});
