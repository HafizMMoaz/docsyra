import { requireDocumentAccess } from "@/lib/docs/access";
import { rejectCsrf } from "@/lib/security/csrf";
import { removeCollaborator, updateCollaboratorRole, logDocumentActivity, type CollaboratorRole } from "@/lib/db/queries";

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
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

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

  if (userId === access.document.owner_id) {
    return Response.json({ success: false, error: "Cannot remove owner" }, { status: 400 });
  }

  await removeCollaborator(id, userId, access.env);

  // 📋 Audit log collaborator removal
  await logDocumentActivity(id, access.userId, "collaborator_removed", access.env).catch((error) =>
    console.error("[audit] Failed to log collaborator removal", error),
  );

  return Response.json({ success: true }, { status: 200 });
}

type UpdateBody = {
  userId?: unknown;
  role?: unknown;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const csrfError = await rejectCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return Response.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return Response.json({ success: false, error: "userId is required" }, { status: 400 });
  }

  const role = typeof body.role === "string" ? (body.role as CollaboratorRole) : "";
  if (role !== "viewer" && role !== "editor") {
    return Response.json(
      { success: false, error: "role must be 'viewer' or 'editor'" },
      { status: 400 },
    );
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
    return Response.json({ success: false, error: "Only owner can update roles" }, { status: 403 });
  }

  if (userId === access.document.owner_id) {
    return Response.json({ success: false, error: "Cannot change owner role" }, { status: 400 });
  }

  const updated = await updateCollaboratorRole(id, userId, role, access.env);
  if (!updated) {
    return Response.json({ success: false, error: "Collaborator not found" }, { status: 404 });
  }

  // 📋 Audit log role update
  await logDocumentActivity(id, access.userId, "role_updated", access.env).catch((error) =>
    console.error("[audit] Failed to log role update", error),
  );

  return Response.json(
    { success: true, collaborator: { user_id: updated.user_id, role: updated.role } },
    { status: 200 },
  );
}
