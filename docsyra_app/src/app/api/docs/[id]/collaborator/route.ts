import { requireDocumentAccess } from "@/lib/docs/access";
import { removeCollaborator } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type RemoveBody = {
  userId?: unknown;
};

export async function DELETE(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  let body: RemoveBody;
  try {
    body = (await request.json()) as RemoveBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return Response.json({ success: false, error: "userId is required" }, { status: 400 });
  }

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

  if (userId === access.document.user_id) {
    return Response.json({ success: false, error: "Cannot remove owner" }, { status: 400 });
  }

  await removeCollaborator(id, userId, access.env);

  return Response.json({ success: true }, { status: 200 });
}
