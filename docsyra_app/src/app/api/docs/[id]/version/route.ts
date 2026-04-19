import { requireDocumentAccess } from "@/lib/docs/access";
import { rejectCsrf } from "@/lib/security/csrf";
import { createDocumentVersion } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type Body = {
  title?: unknown;
  content?: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await context.params;
  const access = await requireDocumentAccess(
    request,
    context as { params: Promise<Record<string, string | string[] | undefined>> },
    id,
    { requireEditor: true },
  );

  if (access instanceof Response) {
    return access;
  }

  const title = typeof body.title === "string" ? body.title.trim() : access.document.title ?? "Untitled";
  const content = typeof body.content === "string" ? body.content : access.document.content ?? "";

  await createDocumentVersion(
    {
      documentId: id,
      title,
      content,
      userId: access.userId,
      type: "manual",
      label: "Manual checkpoint",
    },
    access.env,
  );

  return Response.json({ success: true }, { status: 200 });
}