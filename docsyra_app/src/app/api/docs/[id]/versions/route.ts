import { requireDocumentAccess } from "@/lib/docs/access";
import { createDocumentVersion, getDocumentVersions } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

type CreateVersionBody = {
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
  );

  if (access instanceof Response) {
    return access;
  }

  const versions = await getDocumentVersions(id, access.env);

  return Response.json(
    {
      success: true,
      versions: versions.map((version) => ({
        id: version.id,
        version_number: version.versionNumber,
        created_at: version.createdAt,
        created_by: version.createdBy,
        title: version.title,
        type: version.type,
        label: version.label,
      })),
    },
    { status: 200 },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
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

  let body: CreateVersionBody = {};
  try {
    body = (await request.json()) as CreateVersionBody;
  } catch {
    body = {};
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
