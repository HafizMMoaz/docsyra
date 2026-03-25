import * as Y from "yjs";

type Env = CloudflareEnv;
type WorkerWebSocket = WebSocket & { accept(): void };

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return null;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export class DocumentRoom {
  private readonly doc: Y.Doc;
  private readonly sockets: Set<WorkerWebSocket>;

  constructor(state: unknown, env: Env) {
    void state;
    void env;
    this.doc = new Y.Doc();
    this.sockets = new Set<WorkerWebSocket>();

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      const payload = asArrayBuffer(update);

      for (const socket of this.sockets) {
        if (socket.readyState !== WebSocket.OPEN) {
          continue;
        }

        if (origin === socket) {
          continue;
        }

        socket.send(payload);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const pair = new (globalThis as unknown as {
      WebSocketPair: new () => { 0: WebSocket; 1: WorkerWebSocket };
    }).WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.sockets.add(server);
    server.send(asArrayBuffer(Y.encodeStateAsUpdate(this.doc)));

    server.addEventListener("message", (event: MessageEvent) => {
      const update = toUint8Array(event.data);
      if (!update) {
        return;
      }

      Y.applyUpdate(this.doc, update, server);
    });

    const cleanup = () => {
      this.sockets.delete(server);
    };

    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const docId = url.searchParams.get("id");

    if (!docId) {
      return new Response("Missing doc id", { status: 400 });
    }

    const id = env.COLLAB_ROOM.idFromName(docId);
    return env.COLLAB_ROOM.get(id).fetch(request);
  },
};