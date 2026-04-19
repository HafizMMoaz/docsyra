import { requireDocumentAccess } from "@/lib/docs/access";
import { getCommentsByDoc } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  docId: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const { docId } = await context.params;

  const access = await requireDocumentAccess(
    request,
    context as { params: Promise<Record<string, string | string[] | undefined>> },
    docId,
    { allowPublic: true },
  );

  if (access instanceof Response) {
    return access;
  }

  const threads = await getCommentsByDoc(docId, access.env);

  return Response.json(
    {
      success: true,
      threads: threads.map((thread) => ({
        id: thread.id,
        document_id: thread.documentId,
        created_by: thread.createdBy,
        selection_from: thread.selectionFrom,
        selection_to: thread.selectionTo,
        selection_text: thread.selectionText,
        selection_context_before: thread.selectionContextBefore,
        selection_context_after: thread.selectionContextAfter,
        resolved: thread.resolved,
        created_at: thread.createdAt,
        comments: thread.comments.map((comment) => ({
          id: comment.id,
          thread_id: comment.threadId,
          user_id: comment.userId,
          content: comment.content,
          created_at: comment.createdAt,
          user_name: comment.userName,
          user_email: comment.userEmail,
        })),
      })),
    },
    { status: 200 },
  );
}
