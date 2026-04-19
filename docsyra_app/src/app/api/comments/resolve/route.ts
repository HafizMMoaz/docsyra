import { requireDocumentAccess } from "@/lib/docs/access";
import { getCommentThreadById, setCommentThreadResolved } from "@/lib/db/queries";
import { rejectCsrf } from "@/lib/security/csrf";

export const runtime = "edge";

type ResolveBody = {
  threadId?: unknown;
  resolved?: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const resolved = typeof body.resolved === "boolean" ? body.resolved : true;

  if (!threadId) {
    return Response.json({ success: false, error: "threadId is required" }, { status: 400 });
  }

  const thread = await getCommentThreadById(threadId);
  if (!thread) {
    return Response.json({ success: false, error: "Comment thread not found" }, { status: 404 });
  }

  const access = await requireDocumentAccess(request, context, thread.documentId, { requireEditor: true });
  if (access instanceof Response) {
    return access;
  }

  await setCommentThreadResolved({ threadId, resolved }, access.env);

  return Response.json({ success: true, threadId, resolved }, { status: 200 });
}
