import { DurableObject } from "cloudflare:workers";
import { logDocumentActivity } from "@/lib/db/queries";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";

type Env = CloudflareEnv;

type PresencePeer = {
  connectionId: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  color: string;
  cursor: {
    anchor: number;
    head: number;
  } | null;
  typing: boolean;
  contextLabel: string | null;
  updatedAt: number;
  connectedAt: number;
};

type SnapshotMessage = {
  type: "presence-snapshot";
  peers: PresencePeer[];
};

type CommentEventMessage = {
  type: "comment-event";
  documentId: string;
  threadId: string;
  kind: "created" | "replied" | "resolved";
  at: number;
};

const WS_MESSAGE_SYNC = 0;
const WS_MESSAGE_AWARENESS = 1;

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return null;
}

function colorFromKey(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 45%)`;
}

function toNumber(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(Number(value)) : fallback;
}

function normalizeCursor(cursor: unknown): { anchor: number; head: number } | null {
  if (!cursor || typeof cursor !== "object") {
    return null;
  }

  const raw = cursor as { anchor?: unknown; head?: unknown };
  const anchor = toNumber(raw.anchor, 0);
  const head = toNumber(raw.head, anchor);

  return {
    anchor: Math.max(0, anchor),
    head: Math.max(0, head),
  };
}

function toPresencePeer(clientId: number, state: unknown): PresencePeer {
  const raw = (state ?? {}) as Record<string, unknown>;
  const user = (raw.user ?? {}) as Record<string, unknown>;

  const name = typeof raw.name === "string"
    ? raw.name
    : typeof user.name === "string"
      ? user.name
      : null;

  const color = typeof raw.color === "string"
    ? raw.color
    : typeof user.color === "string"
      ? user.color
      : colorFromKey(String(clientId));

  return {
    connectionId: String(clientId),
    userId: typeof raw.userId === "string" ? raw.userId : null,
    name,
    email: typeof raw.email === "string" ? raw.email : null,
    avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
    color,
    cursor: normalizeCursor(raw.cursor),
    typing: Boolean(raw.typing),
    contextLabel: typeof raw.contextLabel === "string" ? raw.contextLabel : null,
    updatedAt: toNumber(raw.updatedAt, Date.now()),
    connectedAt: Date.now(),
  };
}

export class DocumentRoom extends DurableObject {
  private readonly doc: Y.Doc;
  private readonly awareness: Awareness;
  private readonly sockets: Set<WebSocket>;
  private readonly runtimeEnv: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);

    this.runtimeEnv = env;
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.sockets = new Set<WebSocket>();

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      const framed = new Uint8Array(update.length + 1);
      framed[0] = WS_MESSAGE_SYNC;
      framed.set(update, 1);

      for (const socket of this.sockets) {
        if (socket.readyState !== WebSocket.OPEN) {
          continue;
        }

        if (origin === socket) {
          continue;
        }

        socket.send(framed);
      }
    });
  }

  private broadcastAwarenessUpdate(update: Uint8Array, source?: WebSocket): void {
    const framed = new Uint8Array(update.length + 1);
    framed[0] = WS_MESSAGE_AWARENESS;
    framed.set(update, 1);

    for (const socket of this.sockets) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (source && socket === source) {
        continue;
      }

      socket.send(framed);
    }
  }

  private broadcastTextMessage(payload: string, source?: WebSocket): void {
    for (const socket of this.sockets) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (source && socket === source) {
        continue;
      }

      socket.send(payload);
    }
  }

  private broadcastPresenceSnapshot(target?: WebSocket): void {
    const peers: PresencePeer[] = [];

    for (const [clientId, state] of this.awareness.getStates()) {
      peers.push(toPresencePeer(clientId, state));
    }

    const message: SnapshotMessage = {
      type: "presence-snapshot",
      peers,
    };

    const payload = JSON.stringify(message);

    for (const socket of this.sockets) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (target && socket !== target) {
        continue;
      }

      socket.send(payload);
    }
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
    const framedSync = new Uint8Array(stateUpdate.length + 1);
    framedSync[0] = WS_MESSAGE_SYNC;
    framedSync.set(stateUpdate, 1);
    server.send(framedSync);

    const awarenessClients = Array.from(this.awareness.getStates().keys());
    if (awarenessClients.length > 0) {
      const awarenessUpdate = encodeAwarenessUpdate(this.awareness, awarenessClients);
      const framedAwareness = new Uint8Array(awarenessUpdate.length + 1);
      framedAwareness[0] = WS_MESSAGE_AWARENESS;
      framedAwareness.set(awarenessUpdate, 1);
      server.send(framedAwareness);
    }

    this.broadcastPresenceSnapshot(server);

    server.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data === "string") {
        try {
          const parsed = JSON.parse(event.data) as CommentEventMessage;
          if (parsed.type === "comment-event") {
            this.broadcastTextMessage(JSON.stringify(parsed), server);
          }
        } catch {
          // Ignore malformed text messages.
        }

        return;
      }

      const payload = toUint8Array(event.data);
      if (!payload || payload.length === 0) {
        return;
      }

      const type = payload[0];
      const message = payload.slice(1);

      if (type === WS_MESSAGE_AWARENESS) {
        applyAwarenessUpdate(this.awareness, message, server);
        this.broadcastAwarenessUpdate(message, server);
        this.broadcastPresenceSnapshot();
        return;
      }

      if (type !== WS_MESSAGE_SYNC) {
        return;
      }

      if (!canEdit) {
        return;
      }

      if (documentId) {
        void logDocumentActivity(documentId, userId, "edit", this.runtimeEnv).catch(() => {
          // Ignore logging failures so realtime traffic is not blocked.
        });
      }

      Y.applyUpdate(this.doc, message, server);
    });

    const cleanup = () => {
      this.sockets.delete(server);
      this.broadcastPresenceSnapshot();
    };

    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}
