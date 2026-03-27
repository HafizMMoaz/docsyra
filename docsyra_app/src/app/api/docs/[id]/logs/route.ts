import { requireDocumentAccess } from "@/lib/docs/access";
import { getDocumentLogs } from "@/lib/db/queries";

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

  if (access.accessRole !== "owner") {
    return Response.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const logs = await getDocumentLogs(id, access.env);
  return Response.json({ success: true, logs }, { status: 200 });
}
