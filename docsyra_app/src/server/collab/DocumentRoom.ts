import { DurableObject } from "cloudflare:workers";
import { logDocumentActivity } from "@/lib/db/queries";
import * as Y from "yjs";

type Env = CloudflareEnv;

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  if (typeof data === "string") {
    return null;
  }

  return null;
}

export class DocumentRoom extends DurableObject {
  private readonly doc: Y.Doc;
  private readonly sockets: Set<WebSocket>;
  private readonly runtimeEnv: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);

    this.runtimeEnv = env;
    this.doc = new Y.Doc();
    this.sockets = new Set<WebSocket>();

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      for (const socket of this.sockets) {
        if (socket.readyState !== WebSocket.OPEN) {
          continue;
        }

        if (origin === socket) {
          continue;
        }

        socket.send(update);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    const canEdit = request.headers.get("x-docsyra-can-edit") === "1";
    const userIdHeader = request.headers.get("x-docsyra-user-id");
    const documentId = request.headers.get("x-docsyra-document-id");
    const userId = userIdHeader && userIdHeader.length > 0 ? userIdHeader : null;

    if (upgradeHeader?.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.sockets.add(server);

    if (documentId) {
      void logDocumentActivity(documentId, userId, "join", this.runtimeEnv).catch(() => {
        // Ignore logging failures so realtime traffic is not blocked.
      });
    }

    const stateUpdate = Y.encodeStateAsUpdate(this.doc);
    server.send(stateUpdate);

    server.addEventListener("message", (event: MessageEvent) => {
      if (!canEdit) {
        return;
      }

      const update = toUint8Array(event.data);
      if (!update) {
        return;
      }

      if (documentId) {
        void logDocumentActivity(documentId, userId, "edit", this.runtimeEnv).catch(() => {
          // Ignore logging failures so realtime traffic is not blocked.
        });
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
    });
  }
}
