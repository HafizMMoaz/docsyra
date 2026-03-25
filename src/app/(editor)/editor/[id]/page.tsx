"use client";

export const runtime = "edge";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

type DocumentDetail = {
  id: string;
  title: string | null;
  content: string | null;
};

type DraftDocument = {
  title: string;
  content: string;
};

type SavingStatus = "idle" | "saving" | "saved";

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return null;
}

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [title, setTitle] = useState("Untitled");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState<SavingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipInitialPersistRef = useRef(true);
  const lastSavedRef = useRef<{ title: string; content: string }>({ title: "", content: "" });
  const yDocRef = useRef<Y.Doc | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDocument() {
      const storageKey = `doc-${id}`;

      try {
        const localDraft = localStorage.getItem(storageKey);
        if (localDraft) {
          const parsed = JSON.parse(localDraft) as Partial<DraftDocument>;
          if (typeof parsed.title === "string") {
            setTitle(parsed.title);
          }
          if (typeof parsed.content === "string") {
            setContent(parsed.content);
          }
          if (mounted) {
            setLoading(false);
            setInitialized(true);
          }
          return;
        }
      } catch {
        // Ignore localStorage parsing issues and continue with server fetch.
      }

      try {
        const response = await fetch(`/api/docs/${id}`, {
          method: "GET",
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (response.status === 403 || response.status === 404) {
          if (mounted) {
            setError("Document not found or access denied");
            setLoading(false);
          }
          return;
        }

        if (!response.ok) {
          if (mounted) {
            setError("Failed to load document");
            setLoading(false);
          }
          return;
        }

        const data = (await response.json()) as { success?: boolean; document?: DocumentDetail };

        if (!mounted) {
          return;
        }

        if (!data.document) {
          setError("Failed to load document");
          setLoading(false);
          return;
        }

        setTitle(data.document.title || "Untitled");
        setContent(data.document.content || "");
        lastSavedRef.current = {
          title: data.document.title || "Untitled",
          content: data.document.content || "",
        };
      } catch {
        if (mounted) {
          setError("Failed to load document");
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    }

    if (id) {
      void loadDocument();
    }

    return () => {
      mounted = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [id, router]);

  useEffect(() => {
    if (!initialized || !id) {
      return;
    }

    const initialContent = content;
    const doc = new Y.Doc();
    const yText = doc.getText("content");
    yDocRef.current = doc;
    yTextRef.current = yText;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/api/collab/${id}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    let hasAppliedInitialRemoteState = false;

    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") {
        return;
      }

      const activeSocket = wsRef.current;
      if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
        activeSocket.send(update);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const update = toUint8Array(event.data);
      if (!update) {
        return;
      }

      Y.applyUpdate(doc, update, "remote");

      if (!hasAppliedInitialRemoteState) {
        hasAppliedInitialRemoteState = true;

        // If room is empty, seed from the locally loaded document once.
        if (yText.length === 0 && initialContent.length > 0) {
          yText.doc?.transact(() => {
            yText.insert(0, initialContent);
          }, "initial-seed");
        }
      }
    };

    const handleOpen = () => {
      // The room sends full state on connect; local updates are sent via doc.update events.
    };

    const handleYTextUpdate = () => {
      const nextContent = yText.toString();
      setContent((previous) => (previous === nextContent ? previous : nextContent));
    };

    ws.addEventListener("message", handleMessage);
    ws.addEventListener("open", handleOpen);
    yText.observe(handleYTextUpdate);
    doc.on("update", handleDocUpdate);

    return () => {
      ws.removeEventListener("message", handleMessage);
      ws.removeEventListener("open", handleOpen);
      doc.off("update", handleDocUpdate);
      yText.unobserve(handleYTextUpdate);
      ws.close();

      yTextRef.current = null;
      yDocRef.current = null;
      wsRef.current = null;
      doc.destroy();
    };
  }, [id, initialized]);

  useEffect(() => {
    if (!initialized || !id) {
      return;
    }

    const storageKey = `doc-${id}`;
    localStorage.setItem(storageKey, JSON.stringify({ title, content }));

    if (skipInitialPersistRef.current) {
      skipInitialPersistRef.current = false;
      return;
    }

    setSavingStatus("idle");
    setError(null);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      if (lastSavedRef.current.title === title && lastSavedRef.current.content === content) {
        setSavingStatus("saved");
        return;
      }

      setSavingStatus("saving");

      try {
        const response = await fetch(`/api/docs/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, content }),
        });

        const data = (await response.json()) as { success?: boolean; error?: string };

        if (!response.ok || !data.success) {
          setError(data.error ?? "Failed to save document");
          setSavingStatus("idle");
          return;
        }

        setError(null);
        lastSavedRef.current = { title, content };
        setSavingStatus("saved");
      } catch {
        setError("Failed to save document");
        setSavingStatus("idle");
      }
    }, 1000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [id, title, content, initialized]);

  function handleContentChange(nextContent: string) {
    const yText = yTextRef.current;
    if (!yText) {
      setContent(nextContent);
      return;
    }

    const current = yText.toString();
    if (current === nextContent) {
      return;
    }

    yText.doc?.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, nextContent);
    }, "local-input");
  }

  function getSavingLabel(): string {
    if (savingStatus === "saving") {
      return "Saving...";
    }

    if (savingStatus === "saved") {
      return "Saved";
    }

    return "";
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full max-w-xl rounded-lg border border-slate-300 px-3 py-2 text-base font-medium outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            aria-label="Document title"
            disabled={loading}
          />

          <p className="min-w-20 text-right text-sm font-medium text-slate-500" aria-live="polite">
            {getSavingLabel()}
          </p>
        </header>

        <section className="flex-1 p-4 md:p-6">
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          <textarea
            value={content}
            onChange={(event) => handleContentChange(event.target.value)}
            placeholder="Start writing..."
            className="min-h-100 w-full resize-none rounded-xl border border-slate-300 bg-white p-4 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            disabled={loading}
          />
        </section>
      </div>
    </main>
  );
}
