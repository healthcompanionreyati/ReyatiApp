import { prohibitedTelemetryKeys } from "@/lib/data-classification";

type OperationalValue = string | number | boolean | null;
type OperationalContext = Record<string, OperationalValue | undefined>;

const allowedContextKeys = new Set(["capability", "method", "operation", "route", "status"]);
const safeToken = /^[a-zA-Z0-9_./:-]{1,120}$/;

function eventToken(value: string) {
  return safeToken.test(value) ? value : "application.unclassified_failure";
}

function errorType(error: unknown) {
  if (!(error instanceof Error)) return "NonErrorThrown";
  return safeToken.test(error.name) ? error.name : "Error";
}

function safeContext(context: OperationalContext | undefined) {
  if (!context) return undefined;
  const entries = Object.entries(context).filter(([key, value]) => {
    const normalizedKey = key.replaceAll("_", "").toLowerCase();
    return allowedContextKeys.has(key) && !prohibitedTelemetryKeys.has(normalizedKey)
      && (typeof value === "number" || typeof value === "boolean" || value === null || (typeof value === "string" && safeToken.test(value)));
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Logs only operational metadata. Error messages, causes, request bodies, and identifiers are intentionally excluded. */
export function reportOperationalError(event: string, error: unknown, context?: OperationalContext) {
  const payload = {
    level: "error",
    event: eventToken(event),
    errorType: errorType(error),
    context: safeContext(context),
    occurredAt: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload));
}

/** Emits privacy-safe operational metadata to the hosting platform's runtime log stream. */
export function reportOperationalEvent(event: string, context?: OperationalContext) {
  console.info(JSON.stringify({ level: "info", event: eventToken(event), context: safeContext(context), occurredAt: new Date().toISOString() }));
}
