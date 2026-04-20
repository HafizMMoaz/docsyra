import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";

type Env = CloudflareEnv;
type WorkerWebSocket = WebSocket & { accept(): void };
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

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
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

export class DocumentRoom {
  private readonly doc: Y.Doc;
  private readonly awareness: Awareness;
  private readonly sockets: Set<WorkerWebSocket>;
  private readonly socketClientIds: Map<WorkerWebSocket, Set<number>>;

  constructor(state: unknown, env: Env) {
    void state;
    void env;
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.sockets = new Set<WorkerWebSocket>();
    this.socketClientIds = new Map<WorkerWebSocket, Set<number>>();

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      const framed = new Uint8Array(update.length + 1);
      framed[0] = WS_MESSAGE_SYNC;
      framed.set(update, 1);
      const payload = asArrayBuffer(framed);

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

  private broadcastAwarenessUpdate(update: Uint8Array, source?: WorkerWebSocket): void {
    const framed = new Uint8Array(update.length + 1);
    framed[0] = WS_MESSAGE_AWARENESS;
    framed.set(update, 1);
    const payload = asArrayBuffer(framed);

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

  private broadcastTextMessage(payload: string, source?: WorkerWebSocket): void {
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

  private broadcastPresenceSnapshot(target?: WorkerWebSocket): void {
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
    this.socketClientIds.set(server, new Set<number>());

    const stateUpdate = Y.encodeStateAsUpdate(this.doc);
    const framedSync = new Uint8Array(stateUpdate.length + 1);
    framedSync[0] = WS_MESSAGE_SYNC;
    framedSync.set(stateUpdate, 1);
    server.send(asArrayBuffer(framedSync));

    const awarenessClients = Array.from(this.awareness.getStates().keys());
    if (awarenessClients.length > 0) {
      const awarenessUpdate = encodeAwarenessUpdate(this.awareness, awarenessClients);
      const framedAwareness = new Uint8Array(awarenessUpdate.length + 1);
      framedAwareness[0] = WS_MESSAGE_AWARENESS;
      framedAwareness.set(awarenessUpdate, 1);
      server.send(asArrayBuffer(framedAwareness));
    }

    this.broadcastPresenceSnapshot(server);

    server.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data === "string") {
        this.broadcastTextMessage(event.data, server);
        return;
      }

      const update = toUint8Array(event.data);
      if (!update || update.length === 0) {
        return;
      }

      const type = update[0];
      const message = update.slice(1);

      if (type === WS_MESSAGE_AWARENESS) {
        const before = new Set(this.awareness.getStates().keys());
        applyAwarenessUpdate(this.awareness, message, server);
        const after = new Set(this.awareness.getStates().keys());
        const tracked = this.socketClientIds.get(server) ?? new Set<number>();

        for (const clientId of after) {
          if (typeof clientId === "number" && !before.has(clientId)) {
            tracked.add(clientId);
          }
        }

        this.socketClientIds.set(server, tracked);
        this.broadcastAwarenessUpdate(message, server);
        this.broadcastPresenceSnapshot();
        return;
      }

      if (type !== WS_MESSAGE_SYNC) {
        return;
      }

      Y.applyUpdate(this.doc, message, server);
    });

    const cleanup = () => {
      const trackedClients = this.socketClientIds.get(server);
      if (trackedClients && trackedClients.size > 0) {
        removeAwarenessStates(this.awareness, Array.from(trackedClients), "disconnect");
      }

      this.sockets.delete(server);
      this.socketClientIds.delete(server);
      this.broadcastPresenceSnapshot();
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
    const status = url.searchParams.get("status");

    if (status === "ping") {
      return new Response("Working");
    }

    if (!docId) {
      return new Response("Missing doc id", { status: 400 });
    }

    const id = env.COLLAB_ROOM.idFromName(docId);
    return env.COLLAB_ROOM.get(id).fetch(request);
  },
};