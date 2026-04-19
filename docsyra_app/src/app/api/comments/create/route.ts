import { requireDocumentAccess } from "@/lib/docs/access";
import { addComment, createCommentThread } from "@/lib/db/queries";
import { notifyOnComment } from "@/lib/notifications/comments";
import { rejectCsrf } from "@/lib/security/csrf";

export const runtime = "edge";

type CreateCommentBody = {
  documentId?: unknown;
  text?: unknown;
  content?: unknown;
  selectionRange?: {
    from?: unknown;
    to?: unknown;
    text?: unknown;
    contextBefore?: unknown;
    contextAfter?: unknown;
  };
};

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: CreateCommentBody;
  try {
    body = (await request.json()) as CreateCommentBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
  const commentTextRaw = typeof body.content === "string" ? body.content : body.text;
  const content = typeof commentTextRaw === "string" ? commentTextRaw.trim() : "";
  const from = typeof body.selectionRange?.from === "number" ? body.selectionRange.from : NaN;
  const to = typeof body.selectionRange?.to === "number" ? body.selectionRange.to : NaN;
  const selectionText = typeof body.selectionRange?.text === "string" ? body.selectionRange.text.trim() : "";
  const selectionContextBefore = typeof body.selectionRange?.contextBefore === "string" ? body.selectionRange.contextBefore.trim() : "";
  const selectionContextAfter = typeof body.selectionRange?.contextAfter === "string" ? body.selectionRange.contextAfter.trim() : "";

  if (!documentId || !content || !Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return Response.json({ success: false, error: "Invalid comment payload" }, { status: 400 });
  }

  const access = await requireDocumentAccess(request, context, documentId, { requireEditor: true });
  if (access instanceof Response) {
    return access;
  }

  if (!access.userId) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const thread = await createCommentThread(
    {
      documentId,
      userId: access.userId,
      selectionFrom: from,
      selectionTo: to,
      selectionText: selectionText || null,
      selectionContextBefore: selectionContextBefore || null,
      selectionContextAfter: selectionContextAfter || null,
    },
    access.env,
  );

  const comment = await addComment(
    {
      threadId: thread.id,
      userId: access.userId,
      content,
    },
    access.env,
  );

  const requestOrigin = new URL(request.url).origin;
  void notifyOnComment({
    env: access.env,
    documentId,
    actorUserId: access.userId,
    threadId: thread.id,
    commentId: comment.id,
    commentContent: comment.content,
    requestOrigin,
  });

  return Response.json(
    {
      success: true,
      threadId: thread.id,
      thread: {
        id: thread.id,
        document_id: thread.documentId,
        created_by: thread.createdBy,
        selection_from: thread.selectionFrom,
        selection_to: thread.selectionTo,
        selection_text: thread.selectionText,
        selection_context_before: thread.selectionContextBefore,
        selection_context_after: thread.selectionContextAfter,
        created_at: thread.createdAt,
        comments: [
          {
            id: comment.id,
            thread_id: comment.threadId,
            user_id: comment.userId,
            content: comment.content,
            created_at: comment.createdAt,
          },
        ],
      },
    },
    { status: 201 },
  );
}
