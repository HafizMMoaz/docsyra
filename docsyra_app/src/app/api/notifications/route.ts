import { requireAuthenticatedUser } from "@/lib/docs/access";
import {
  getNotificationsByUser,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/db/queries";
import { rejectCsrf } from "@/lib/security/csrf";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const auth = await requireAuthenticatedUser(request, context);
  if (auth instanceof Response) {
    return auth;
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");

  const [notifications, unreadCount] = await Promise.all([
    getNotificationsByUser(auth.userId, { limit: Number.isFinite(limit) ? limit : 20 }, auth.env),
    getUnreadNotificationCount(auth.userId, auth.env),
  ]);

  return Response.json(
    {
      success: true,
      notifications: notifications.map((notification) => ({
        id: notification.id,
        actor_user_id: notification.actorUserId,
        actor_name: notification.actorName,
        actor_email: notification.actorEmail,
        document_id: notification.documentId,
        document_title: notification.documentTitle,
        thread_id: notification.threadId,
        comment_id: notification.commentId,
        type: notification.type,
        mention_token: notification.mentionToken,
        message: notification.message,
        read_at: notification.readAt,
        created_at: notification.createdAt,
      })),
      unreadCount,
    },
    { status: 200 },
  );
}

type MarkReadBody = {
  notificationId?: unknown;
  all?: unknown;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAuthenticatedUser(request, context);
  if (auth instanceof Response) {
    return auth;
  }

  let body: MarkReadBody = {};
  try {
    body = (await request.json()) as MarkReadBody;
  } catch {
    body = {};
  }

  const markAll = Boolean(body.all);
  const notificationId = typeof body.notificationId === "string" ? body.notificationId.trim() : "";

  if (!markAll && !notificationId) {
    return Response.json({ success: false, error: "notificationId or all is required" }, { status: 400 });
  }

  if (markAll) {
    await markAllNotificationsRead(auth.userId, auth.env);
  } else {
    await markNotificationRead(auth.userId, notificationId, auth.env);
  }

  const unreadCount = await getUnreadNotificationCount(auth.userId, auth.env);
  return Response.json({ success: true, unreadCount }, { status: 200 });
}
