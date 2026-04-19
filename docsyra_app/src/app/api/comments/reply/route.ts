import { requireDocumentAccess } from "@/lib/docs/access";
import { addComment, getCommentThreadById } from "@/lib/db/queries";
import { notifyOnComment } from "@/lib/notifications/comments";
import { rejectCsrf } from "@/lib/security/csrf";

export const runtime = "edge";

type ReplyCommentBody = {
  threadId?: unknown;
  content?: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: ReplyCommentBody;
  try {
    body = (await request.json()) as ReplyCommentBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!threadId || !content) {
    return Response.json({ success: false, error: "Invalid reply payload" }, { status: 400 });
  }

  const thread = await getCommentThreadById(threadId);
  if (!thread) {
    return Response.json({ success: false, error: "Comment thread not found" }, { status: 404 });
  }

  const access = await requireDocumentAccess(request, context, thread.documentId, { requireEditor: true });
  if (access instanceof Response) {
    return access;
  }

  if (!access.userId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const comment = await addComment(
    {
      threadId,
      userId: access.userId,
      content,
    },
    access.env,
  );

  const requestOrigin = new URL(request.url).origin;
  void notifyOnComment({
    env: access.env,
    documentId: thread.documentId,
    actorUserId: access.userId,
    threadId,
    commentId: comment.id,
    commentContent: comment.content,
    requestOrigin,
  });

  return Response.json(
    {
      success: true,
      comment: {
        id: comment.id,
        thread_id: comment.threadId,
        user_id: comment.userId,
        content: comment.content,
        created_at: comment.createdAt,
      },
      threadId,
    },
    { status: 201 },
  );
}
