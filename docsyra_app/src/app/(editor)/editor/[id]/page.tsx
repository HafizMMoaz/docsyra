"use client";

export const runtime = "edge";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

type DocumentDetail = {
  id: string;
  title: string | null;
  content: string | null;
  visibility: "private" | "public";
};

type AccessRole = "owner" | "editor" | "viewer" | "public";

type Collaborator = {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  role: "viewer" | "editor";
  created_at: number;
};

type SavingStatus = "idle" | "saving" | "saved";

type ActivityLog = {
  id: string;
  user_id: string | null;
  action: "view" | "open" | "edit" | "join";
  created_at: number;
  email: string | null;
  name: string | null;
};

function resolveCollabWebSocketUrl(id: string): string {
  const configuredBase = process.env.NEXT_PUBLIC_COLLAB_WS_BASE_URL?.trim();

  if (configuredBase) {
    const normalized = configuredBase
      .replace(/^https:/i, "wss:")
      .replace(/^http:/i, "ws:")
      .replace(/\/+$/, "");

    return `${normalized}?id=${encodeURIComponent(id)}`;
  }

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${window.location.host}/api/collab/${encodeURIComponent(id)}`;
}

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
  const [noAccess, setNoAccess] = useState(false);
  const [accessRole, setAccessRole] = useState<AccessRole | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [verificationHint, setVerificationHint] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipInitialPersistRef = useRef(true);
  const lastSavedRef = useRef<{ title: string; content: string }>({ title: "", content: "" });
  const yDocRef = useRef<Y.Doc | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDocument() {
      try {
        const response = await fetch(`/api/docs/${id}`, {
          method: "GET",
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (response.status === 403) {
          if (mounted) {
            setNoAccess(true);
            setLoading(false);
          }
          return;
        }

        if (response.status === 404) {
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

        const data = (await response.json()) as {
          success?: boolean;
          document?: DocumentDetail;
          accessRole?: AccessRole;
          canEdit?: boolean;
        };

        if (!mounted) {
          return;
        }

        if (!data.document) {
          setError("Failed to load document");
          setLoading(false);
          return;
        }

        setNoAccess(false);
        setAccessRole(data.accessRole ?? null);
        setCanEdit(Boolean(data.canEdit));
        setVisibility(data.document.visibility === "public" ? "public" : "private");

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
    if (!initialized || !id || noAccess) {
      return;
    }

    const initialContent = content;
    const doc = new Y.Doc();
    const yText = doc.getText("content");
    yDocRef.current = doc;
    yTextRef.current = yText;

    const wsUrl = resolveCollabWebSocketUrl(id);
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
  }, [id, initialized, noAccess]);

  useEffect(() => {
    if (!initialized || !id || !canEdit || noAccess) {
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
  }, [id, title, content, initialized, canEdit, noAccess]);

  function handleContentChange(nextContent: string) {
    if (!canEdit) {
      return;
    }

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
    if (!canEdit) {
      return "Read-only";
    }

    if (savingStatus === "saving") {
      return "Saving...";
    }

    if (savingStatus === "saved") {
      return "Saved";
    }

    return "";
  }

  async function handleVisibilityChange(nextVisibility: "private" | "public") {
    if (accessRole !== "owner" || nextVisibility === visibility) {
      return;
    }

    setVisibilitySaving(true);
    setError(null);
    setVerificationHint(null);

    try {
      const response = await fetch(`/api/docs/${id}/visibility`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visibility: nextVisibility }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        visibility?: "private" | "public";
      };

      if (!response.ok || !data.success) {
        const message = data.error ?? "Failed to update visibility";
        setError(message);
        if (message.toLowerCase().includes("verify your email")) {
          setVerificationHint("Verify your email to make documents public and invite collaborators.");
        }
        return;
      }

      setVisibility(data.visibility === "public" ? "public" : "private");
      setVerificationHint(null);
    } catch {
      setError("Failed to update visibility");
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function loadActivityLogs() {
    setLogsLoading(true);
    setLogsError(null);

    try {
      const response = await fetch(`/api/docs/${id}/logs`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        logs?: ActivityLog[];
      };

      if (!response.ok || !data.success) {
        setLogsError(data.error ?? "Failed to load logs");
        return;
      }

      setActivityLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setLogsError("Failed to load logs");
    } finally {
      setLogsLoading(false);
    }
  }

  async function openLogsPanel() {
    setLogsOpen(true);
    await loadActivityLogs();
  }

  function formatLogTime(value: number): string {
    return new Date(value).toLocaleString();
  }

  async function loadCollaborators() {
    setCollaboratorsLoading(true);
    setShareError(null);

    try {
      const response = await fetch(`/api/docs/${id}/collaborators`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        ownerId?: string;
        collaborators?: Collaborator[];
      };

      if (!response.ok || !data.success) {
        setShareError(data.error ?? "Failed to load collaborators");
        return;
      }

      setOwnerId(data.ownerId ?? null);
      setCollaborators(Array.isArray(data.collaborators) ? data.collaborators : []);
    } catch {
      setShareError("Failed to load collaborators");
    } finally {
      setCollaboratorsLoading(false);
    }
  }

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!email) {
      setShareError("Email is required");
      return;
    }

    setInviteBusy(true);
    setShareError(null);
    setShareSuccess(null);
    setVerificationHint(null);

    try {
      const response = await fetch("/api/docs/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: id,
          email,
          role: inviteRole,
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        const message = data.error ?? "Failed to invite collaborator";
        setShareError(message);
        if (message.toLowerCase().includes("verify your email")) {
          setVerificationHint("Verify your email to unlock sharing and public visibility.");
        }
        return;
      }

      setInviteEmail("");
      setShareSuccess("Invitation added");
      setVerificationHint(null);
      await loadCollaborators();
    } catch {
      setShareError("Failed to invite collaborator");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRemoveCollaborator(userId: string) {
    setShareError(null);
    setShareSuccess(null);

    try {
      const response = await fetch(`/api/docs/${id}/collaborator`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setShareError(data.error ?? "Failed to remove collaborator");
        return;
      }

      setShareSuccess("Collaborator removed");
      await loadCollaborators();
    } catch {
      setShareError("Failed to remove collaborator");
    }
  }

  async function openShareModal() {
    setShareOpen(true);
    setShareError(null);
    setShareSuccess(null);
    await loadCollaborators();
  }

  if (noAccess) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4">
          <div className="w-full rounded-xl border border-slate-200 bg-white p-6 text-center">
            <h1 className="text-xl font-semibold">No access</h1>
            <p className="mt-2 text-sm text-slate-600">You do not have permission to view this document.</p>
          </div>
        </div>
      </main>
    );
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
            disabled={loading || !canEdit}
          />

          <div className="flex items-center gap-3">
            {visibility === "public" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Public document</span>
            ) : null}
            {accessRole === "owner" ? (
              <select
                value={visibility}
                onChange={(event) => {
                  void handleVisibilityChange(event.target.value === "public" ? "public" : "private");
                }}
                disabled={visibilitySaving}
                className="rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Document visibility"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            ) : null}
            {accessRole === "owner" ? (
              <button
                type="button"
                onClick={() => {
                  void openLogsPanel();
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Logs
              </button>
            ) : null}
            {accessRole === "owner" ? (
              <button
                type="button"
                onClick={() => {
                  void openShareModal();
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Share
              </button>
            ) : null}
            <p className="min-w-20 text-right text-sm font-medium text-slate-500" aria-live="polite">
              {getSavingLabel()}
            </p>
          </div>
        </header>

        {verificationHint ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 md:px-6">{verificationHint}</div>
        ) : null}

        <section className="flex-1 p-4 md:p-6">
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          <textarea
            value={content}
            onChange={(event) => handleContentChange(event.target.value)}
            placeholder="Start writing..."
            className="min-h-100 w-full resize-none rounded-xl border border-slate-300 bg-white p-4 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            disabled={loading || !canEdit}
          />
          {!canEdit && !loading ? <p className="mt-3 text-sm text-slate-500">You have viewer access (read-only).</p> : null}
        </section>
      </div>

      {shareOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Share document</h2>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="user@example.com"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400"
              />
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value === "editor" ? "editor" : "viewer")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  void handleInvite();
                }}
                disabled={inviteBusy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {inviteBusy ? "Inviting..." : "Invite"}
              </button>
            </div>

            {shareError ? <p className="mt-3 text-sm text-red-600">{shareError}</p> : null}
            {shareSuccess ? <p className="mt-3 text-sm text-emerald-600">{shareSuccess}</p> : null}
            {verificationHint ? <p className="mt-3 text-sm text-amber-700">{verificationHint}</p> : null}

            <div className="mt-4 rounded-lg border border-slate-200">
              {collaboratorsLoading ? (
                <p className="px-3 py-4 text-sm text-slate-500">Loading collaborators...</p>
              ) : collaborators.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">No collaborators yet.</p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {collaborators.map((collaborator) => (
                    <li key={collaborator.id} className="flex items-center justify-between gap-3 px-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{collaborator.name || collaborator.email || "Unknown user"}</p>
                        <p className="text-xs text-slate-500">{collaborator.email || "No email"} • {collaborator.role}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void handleRemoveCollaborator(collaborator.user_id);
                        }}
                        disabled={ownerId === collaborator.user_id}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {logsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Activity logs</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void loadActivityLogs();
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-100"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setLogsOpen(false)}
                  className="rounded-md px-2 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </div>

            {logsError ? <p className="mt-3 text-sm text-red-600">{logsError}</p> : null}

            <div className="mt-4 rounded-lg border border-slate-200">
              {logsLoading ? (
                <p className="px-3 py-4 text-sm text-slate-500">Loading activity...</p>
              ) : activityLogs.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">No activity yet.</p>
              ) : (
                <ul className="max-h-96 divide-y divide-slate-200 overflow-auto">
                  {activityLogs.map((log) => (
                    <li key={log.id} className="flex items-center justify-between gap-3 px-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{log.name || log.email || "Anonymous"}</p>
                        <p className="text-xs text-slate-500">{log.action}</p>
                      </div>
                      <p className="text-xs text-slate-500">{formatLogTime(log.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
