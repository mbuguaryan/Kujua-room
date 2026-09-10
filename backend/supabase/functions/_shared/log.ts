type LogLevel = "info" | "warn" | "error";

export function log(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {},
) {
  const entry = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...context,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}
