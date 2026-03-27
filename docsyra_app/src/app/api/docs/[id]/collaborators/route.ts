import { requireDocumentAccess } from "@/lib/docs/access";
import { getCollaborators } from "@/lib/db/queries";

export const runtime = "edge";

type RouteParams = {
  id: string;
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

  const collaborators = await getCollaborators(id, access.env);

  return Response.json(
    {
      success: true,
      accessRole: access.accessRole,
      ownerId: access.document.user_id,
      collaborators,
    },
    { status: 200 },
  );
}
