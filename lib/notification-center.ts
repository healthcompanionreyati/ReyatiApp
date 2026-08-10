import { and, count, desc, eq, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";

export class NotificationValidationError extends Error {
  constructor(message: string) { super(message); this.name = "NotificationValidationError"; }
}

export function notificationRecord(input: {
  userId: string; type: string; title: string; body: string; actionPath?: string | null;
  resourceType?: string | null; resourceId?: string | null; dedupeKey: string; createdAt: Date;
}) {
  return {
    id: crypto.randomUUID(), userId: input.userId, type: input.type, title: input.title, body: input.body,
    actionPath: input.actionPath ?? null, resourceType: input.resourceType ?? null, resourceId: input.resourceId ?? null,
    dedupeKey: input.dedupeKey, status: "unread", readAt: null, createdAt: input.createdAt,
  };
}

function text(value: string | null, name: string, max: number) {
  const result = value?.trim() ?? "";
  if (result.length > max) throw new NotificationValidationError(`${name} is invalid`);
  return result;
}

function cursor(value: string | null) {
  if (!value) return null; const [timestamp, id] = value.split(":", 2); const createdAt = Number(timestamp);
  if (!Number.isSafeInteger(createdAt) || !id || id.length > 128) throw new NotificationValidationError("cursor is invalid");
  return { createdAt: new Date(createdAt), id };
}

export async function getNotifications(userId: string, searchParams: URLSearchParams) {
  const db = await getDb(); const status = text(searchParams.get("status"), "status", 20); const type = text(searchParams.get("type"), "type", 40); const pageCursor = cursor(searchParams.get("cursor"));
  if (status && !["unread", "read"].includes(status)) throw new NotificationValidationError("status is invalid");
  const where = and(
    eq(notifications.userId, userId),
    status ? eq(notifications.status, status) : undefined,
    type ? eq(notifications.type, type) : undefined,
    pageCursor ? or(lt(notifications.createdAt, pageCursor.createdAt), and(eq(notifications.createdAt, pageCursor.createdAt), lt(notifications.id, pageCursor.id))) : undefined,
  );
  const rows = await db.select({
    id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body,
    actionPath: notifications.actionPath, resourceType: notifications.resourceType, resourceId: notifications.resourceId,
    status: notifications.status, readAt: notifications.readAt, createdAt: notifications.createdAt,
  }).from(notifications).where(where).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(51);
  const page = rows.slice(0, 50); const last = page.at(-1);
  const unread = await db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.status, "unread")));
  return { notifications: page, unreadCount: unread[0]?.value ?? 0, nextCursor: rows.length > 50 && last ? `${last.createdAt.valueOf()}:${last.id}` : null };
}

export async function updateNotifications(userId: string, body: Record<string, unknown>) {
  const db = await getDb(); const action = typeof body.action === "string" ? body.action : ""; const now = new Date();
  if (action === "mark_all_read") {
    await db.update(notifications).set({ status: "read", readAt: now }).where(and(eq(notifications.userId, userId), eq(notifications.status, "unread")));
    return { updated: true };
  }
  if (action === "mark_read") {
    const id = typeof body.notificationId === "string" && body.notificationId.length <= 128 ? body.notificationId : "";
    if (!id) throw new NotificationValidationError("notificationId is invalid");
    const updated = await db.update(notifications).set({ status: "read", readAt: now }).where(and(eq(notifications.id, id), eq(notifications.userId, userId), eq(notifications.status, "unread"))).returning({ id: notifications.id });
    return { updated: Boolean(updated[0]) };
  }
  throw new NotificationValidationError("action is invalid");
}
