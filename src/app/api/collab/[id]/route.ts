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

  const { env } = getRequestContext() as { env: { COLLAB_ROOM: DurableObjectNamespace } };
  const { id } = await context.params;

  const roomId = env.COLLAB_ROOM.idFromName(id);
  const room = env.COLLAB_ROOM.get(roomId);

  return room.fetch(request);
}
