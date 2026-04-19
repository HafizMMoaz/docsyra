import { requireDocumentAccess } from "@/lib/docs/access";
import { rejectCsrf } from "@/lib/security/csrf";
import { createDocumentVersion, getVersionById, logDocumentActivity, updateDocument } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type Body = {
  versionId?: unknown;
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

  const versionId = typeof body.versionId === "string" ? body.versionId.trim() : "";
  if (!versionId) {
    return Response.json({ success: false, error: "versionId is required" }, { status: 400 });
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

  const version = await getVersionById(versionId, access.env);
  if (!version || version.documentId !== id) {
    return Response.json({ success: false, error: "Version not found" }, { status: 404 });
  }

  await updateDocument(
    id,
    {
      content: version.content,
    },
    access.env,
  );

  await createDocumentVersion(
    {
      documentId: id,
      content: version.content,
      userId: access.userId,
      type: "restore",
      label: `Restored from version ${versionId}`,
    },
    access.env,
  );

  await logDocumentActivity(id, access.userId, "edit", access.env);

  return Response.json(
    {
      success: true,
      document: {
        title: access.document.title,
        content: version.content,
      },
    },
    { status: 200 },
  );
}
