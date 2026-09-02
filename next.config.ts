import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudflare.com https: wss:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  isProduction ? "upgrade-insecure-requests" : "",
].filter(Boolean).join("; ");

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "Content-Security-Policy", value: csp },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ] }];
  },
};
export default nextConfig;
