import { requireDocumentAccess } from "@/lib/docs/access";
import { getVersionById } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> },
): Promise<Response> {
  const url = new URL(request.url);
  const versionOneId = url.searchParams.get("v1")?.trim() ?? "";
  const versionTwoId = url.searchParams.get("v2")?.trim() ?? "";

  if (!versionOneId || !versionTwoId) {
    return Response.json({ error: "Missing versions" }, { status: 400 });
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

  const [versionOne, versionTwo] = await Promise.all([
    getVersionById(versionOneId, access.env),
    getVersionById(versionTwoId, access.env),
  ]);

  if (!versionOne || !versionTwo || versionOne.documentId !== id || versionTwo.documentId !== id) {
    return Response.json({ error: "Version not found" }, { status: 404 });
  }

  return Response.json(
    {
      old: versionOne.content,
      new: versionTwo.content,
    },
    { status: 200 },
  );
}
