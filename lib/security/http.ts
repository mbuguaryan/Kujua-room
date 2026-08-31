import { NextResponse } from "next/server";
import { HttpError } from "./auth";
import { log } from "./log";
export function apiError(error: unknown, event: string) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  log("error", event, {
    message: error instanceof Error ? error.message : "unknown",
  });
  return NextResponse.json(
    { error: "The request could not be completed." },
    { status: 500 },
  );
}
