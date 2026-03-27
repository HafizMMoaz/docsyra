import { canEditDocument, requireDocumentAccess } from "@/lib/docs/access";
import { deleteDocument, logDocumentActivity, updateDocument } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type UpdateBody = {
  title?: unknown;
  content?: unknown;
};

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const { id } = await context.params;
  const access = await requireDocumentAccess(
    request,
    context as { params: Promise<Record<string, string | string[] | undefined>> },
    id,
    { allowPublic: true },
  );
  if (access instanceof Response) {
    return access;
  }

  await logDocumentActivity(id, access.userId, "view", access.env);

  return Response.json(
    {
      success: true,
      document: access.document,
      accessRole: access.accessRole,
      canEdit: canEditDocument(access.accessRole),
    },
    { status: 200 },
  );
}

export async function PUT(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
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

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const content = typeof body.content === "string" ? body.content : undefined;

  await updateDocument(
    id,
    {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
    },
    access.env,
  );

  await logDocumentActivity(id, access.userId, "edit", access.env);

  return Response.json({ success: true }, { status: 200 });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const { id } = await context.params;
  const access = await requireDocumentAccess(
    request,
    context as { params: Promise<Record<string, string | string[] | undefined>> },
    id,
  );
  if (access instanceof Response) {
    return access;
  }

  if (access.accessRole !== "owner") {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  await deleteDocument(id, access.env);

  return Response.json({ success: true }, { status: 200 });
}
