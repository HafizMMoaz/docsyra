/// <reference types="@cloudflare/workers-types" />

interface DurableObjectState {}

interface DurableObjectId {}

interface DurableObjectStub {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

declare const WebSocketPair: {
  new (): {
    0: WebSocket;
    1: WebSocket;
  };
};

interface ResponseInit {
  webSocket?: WebSocket;
}

declare global {
  interface CloudflareEnv {
    COLLAB_ROOM: DurableObjectNamespace;
  }
}

export {};
