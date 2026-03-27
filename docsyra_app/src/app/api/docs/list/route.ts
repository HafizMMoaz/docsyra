import { requireAuthenticatedUser } from "@/lib/docs/access";
import { getAccessibleDocumentsByUser } from "@/lib/db/queries";

export const runtime = "edge";

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
): Promise<Response> {
  const auth = await requireAuthenticatedUser(request, context);
  if (auth instanceof Response) {
    return auth;
  }

  const documents = await getAccessibleDocumentsByUser(auth.userId, auth.env);

  return Response.json({ success: true, documents }, { status: 200 });
}
