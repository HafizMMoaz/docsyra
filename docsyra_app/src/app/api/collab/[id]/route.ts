import { canEditDocument, requireDocumentAccess } from "@/lib/docs/access";
import { getUserById } from "@/lib/db/queries";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

type Params = {
  id: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<Params> },
): Promise<Response> {
  const upgradeHeader = request.headers.get("Upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return new Response("Expected websocket", { status: 426 });
  }

  const { env } = getRequestContext() as unknown as { env: CloudflareEnv & { COLLAB_ROOM: DurableObjectNamespace } };
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

  const headers = new Headers(request.headers);
  headers.set("x-docsyra-can-edit", canEditDocument(access.accessRole) ? "1" : "0");
  headers.set("x-docsyra-user-id", access.userId ?? "");
  headers.set("x-docsyra-document-id", id);

  if (access.userId) {
    const user = await getUserById(access.userId, access.env);
    headers.set("x-docsyra-user-name", user?.attributes.name ?? "");
    headers.set("x-docsyra-user-email", user?.attributes.email ?? "");
    headers.set("x-docsyra-user-avatar", user?.attributes.avatar_url ?? "");
  }

  const authorizedRequest = new Request(request, { headers });

  const roomId = env.COLLAB_ROOM.idFromName(id);
  const room = env.COLLAB_ROOM.get(roomId);

  return room.fetch(authorizedRequest);
}
