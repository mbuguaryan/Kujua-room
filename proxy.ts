import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    MUTATING_METHODS.has(request.method)
  ) {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite === "cross-site") {
      return NextResponse.json(
        { error: "Cross-site request blocked." },
        { status: 403 },
      );
    }

    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json(
        { error: "Request origin is not allowed." },
        { status: 403 },
      );
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/).*)"],
};
