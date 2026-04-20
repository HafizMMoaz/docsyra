"use client";

export const runtime = "edge";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import * as Y from "yjs";
import { getCsrfToken } from "@/lib/security/csrf-client";
import { getSession } from "@/lib/auth/session-client";
import { generateDiff } from "@/lib/diff/generateDiff";
import type { User } from "@/types";
import RichTextEditor from "@/components/editor/RichTextEditor";

type DocumentDetail = {
  id: string;
  title: string | null;
  content: string | null;
  visibility: "private" | "public";
  github_repo: string | null;
  github_branch: string | null;
  github_path: string | null;
  last_github_sha: string | null;
  last_synced_at: number | null;
};

type GitHubSyncStatus = "synced" | "diverged" | "unknown";

type GitHubRepoOption = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
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

type DocumentVersion = {
  id: string;
  version_number: number;
  created_at: number;
  created_by: string | null;
  title: string | null;
  type?: string | null;
  label?: string | null;
};

type DocumentDiffChange = {
  added: boolean;
  removed: boolean;
  value: string;
};

type NotificationItem = {
  id: string;
  actor_user_id: string;
  actor_name: string | null;
  actor_email: string | null;
  document_id: string;
  document_title: string | null;
  thread_id: string | null;
  comment_id: string | null;
  type: "comment" | "mention";
  mention_token: string | null;
  message: string;
  read_at: number | null;
  created_at: number;
};

type CommentMessage = {
  id: string;
  thread_id: string;
  user_id: string;
  content: string;
  created_at: number;
  user_name?: string | null;
  user_email?: string | null;
};

type CommentThread = {
  id: string;
  document_id: string;
  created_by: string;
  selection_from: number;
  selection_to: number;
  selection_text?: string | null;
  selection_context_before?: string | null;
  selection_context_after?: string | null;
  resolved?: boolean;
  created_at: number;
  comments: CommentMessage[];
};

type CommentSelectionRange = {
  from: number;
  to: number;
  text: string;
  contextBefore: string;
  contextAfter: string;
};

type PresenceCursor = {
  anchor: number;
  head: number;
};

type PresencePeer = {
  connectionId: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  color: string;
  cursor: PresenceCursor | null;
  typing: boolean;
  contextLabel: string | null;
  updatedAt: number;
  connectedAt: number;
};

type PresenceSnapshotMessage = {
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

type CollabMessage = PresenceSnapshotMessage | CommentEventMessage;

const WS_MESSAGE_SYNC = 0;
const WS_MESSAGE_AWARENESS = 1;

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

function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

function colorFromKey(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 45%)`;
}

function getDisplayName(user: Pick<User, "name" | "email"> | PresencePeer): string {
  return user.name?.trim() || user.email?.trim() || "Anonymous";
}

function getInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function getVersionTypeLabel(version: DocumentVersion): string {
  if (version.type === "manual") {
    return "Manual";
  }

  if (version.type === "restore") {
    return "Restore";
  }

  return "Auto";
}

function getCommentAuthorDetails(comment: CommentMessage): { label: string; initials: string; color: string } {
  const label = comment.user_name?.trim() || comment.user_email?.trim() || "Anonymous";
  const key = comment.user_id || comment.user_email || label;

  return {
    label,
    initials: getInitials(label),
    color: colorFromKey(key),
  };
}

function getCommentContextLabel(thread: CommentThread): string {
  const fragments = [thread.selection_context_before?.trim(), thread.selection_text?.trim(), thread.selection_context_after?.trim()].filter(Boolean);
  return fragments.join(" • ");
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
  const [resendVerificationBusy, setResendVerificationBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [githubRepo, setGitHubRepo] = useState<string | null>(null);
  const [githubBranch, setGitHubBranch] = useState<string | null>(null);
  const [githubPath, setGitHubPath] = useState<string | null>(null);
  const [githubModalOpen, setGitHubModalOpen] = useState(false);
  const [githubAccountConnected, setGitHubAccountConnected] = useState(false);
  const [githubRepoOptions, setGitHubRepoOptions] = useState<GitHubRepoOption[]>([]);
  const [githubSelectedRepo, setGitHubSelectedRepo] = useState("");
  const [githubSelectedBranch, setGitHubSelectedBranch] = useState("main");
  const [githubSelectedPath, setGitHubSelectedPath] = useState("");
  const [githubLoadingRepos, setGitHubLoadingRepos] = useState(false);
  const [githubSaving, setGitHubSaving] = useState(false);
  const [githubError, setGitHubError] = useState<string | null>(null);
  const [githubSuccess, setGitHubSuccess] = useState<string | null>(null);
  const [githubSyncStatus, setGitHubSyncStatus] = useState<GitHubSyncStatus>("unknown");
  const [githubSyncStatusLoading, setGitHubSyncStatusLoading] = useState(false);
  const [githubLastSyncedAt, setGitHubLastSyncedAt] = useState<number | null>(null);
  const [githubPreviewLoading, setGitHubPreviewLoading] = useState(false);
  const [githubPreviewDiff, setGitHubPreviewDiff] = useState<DocumentDiffChange[]>([]);
  const [githubPreviewReady, setGitHubPreviewReady] = useState(false);
  const [githubPulling, setGitHubPulling] = useState(false);
  const githubLinked = Boolean(githubRepo && githubPath);
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
  const [compareRightId, setCompareRightId] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareLeftContent, setCompareLeftContent] = useState<string>("");
  const [compareRightContent, setCompareRightContent] = useState<string>("");
  const [commentThreads, setCommentThreads] = useState<CommentThread[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [showResolvedThreads, setShowResolvedThreads] = useState(true);
  const [commentActivityCount, setCommentActivityCount] = useState(0);
  const [activeCommentThreadId, setActiveCommentThreadId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [selectedCommentRange, setSelectedCommentRange] = useState<CommentSelectionRange | null>(null);
  const [pendingCommentAnchor, setPendingCommentAnchor] = useState<{ threadId: string; range: { from: number; to: number } } | null>(null);
  const [commentPopover, setCommentPopover] = useState<{ threadId: string; x: number; y: number } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [focusCommentTarget, setFocusCommentTarget] = useState<{ threadId: string; from: number; to: number; key: number } | null>(null);
  const [commentFocusKey, setCommentFocusKey] = useState(0);
  const [presencePeers, setPresencePeers] = useState<PresencePeer[]>([]);
  const [highlightedPresenceId, setHighlightedPresenceId] = useState<string | null>(null);
  const [focusedRemoteCursor, setFocusedRemoteCursor] = useState<{ id: string; pos: number; key: number } | null>(null);
  const [collabDoc, setCollabDoc] = useState<Y.Doc | null>(null);
  const [collabAwareness, setCollabAwareness] = useState<Awareness | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipInitialPersistRef = useRef(true);
  const lastSavedRef = useRef<{ title: string; content: string }>({ title: "", content: "" });
  const yDocRef = useRef<Y.Doc | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const isSavingRef = useRef(false);

  function publishPresenceUpdate(update: { cursor?: { anchor: number; head: number } | null; typing?: boolean; contextLabel?: string | null }) {
    const awareness = awarenessRef.current;
    if (!awareness) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(update, "cursor")) {
      awareness.setLocalStateField("cursor", update.cursor ?? null);
    }

    if (Object.prototype.hasOwnProperty.call(update, "typing")) {
      awareness.setLocalStateField("typing", Boolean(update.typing));
    }

    if (Object.prototype.hasOwnProperty.call(update, "contextLabel")) {
      awareness.setLocalStateField("contextLabel", update.contextLabel ?? null);
    }

    awareness.setLocalStateField("updatedAt", Date.now());
  }

  const compareLeftVersion = versions.find((version) => version.id === compareLeftId) ?? null;
  const compareRightVersion = versions.find((version) => version.id === compareRightId) ?? null;
  const commentAnchors = useMemo(
    () =>
      commentThreads.map((thread) => ({
        threadId: thread.id,
        from: thread.selection_from,
        to: thread.selection_to,
        quote: thread.selection_text,
        contextBefore: thread.selection_context_before,
        contextAfter: thread.selection_context_after,
      })),
    [commentThreads],
  );

  const visibleCommentThreads = useMemo(
    () => (showResolvedThreads ? commentThreads : commentThreads.filter((thread) => !thread.resolved)),
    [commentThreads, showResolvedThreads],
  );

  const resolvedCommentCount = useMemo(() => commentThreads.filter((thread) => thread.resolved).length, [commentThreads]);

  const diffHtml = useMemo(() => generateDiff(compareLeftContent, compareRightContent), [compareLeftContent, compareRightContent]);

  async function persistDocument(nextTitle: string, nextContent: string, createVersion: boolean): Promise<boolean> {
    const response = await fetch(`/api/docs/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...csrfHeaders(),
      },
      body: JSON.stringify({
        title: nextTitle,
        content: nextContent,
        createVersion,
      }),
    });

    const data = (await response.json()) as { success?: boolean; error?: string };
    if (!response.ok || !data.success) {
      setError(data.error ?? "Failed to save document");
      return false;
    }

    return true;
  }

  async function autosave(nextTitle: string, nextContent: string): Promise<boolean> {
    // Prevent overlapping autosave requests (race condition)
    if (isSavingRef.current) {
      return false;
    }

    isSavingRef.current = true;
    try {
      return await persistDocument(nextTitle, nextContent, false);
    } finally {
      isSavingRef.current = false;
    }
  }

  useEffect(() => {
    let mounted = true;

    void getSession().then((user) => {
      if (mounted) {
        setCurrentUser(user);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

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
        setGitHubRepo(data.document.github_repo ?? null);
        setGitHubBranch(data.document.github_branch ?? null);
        setGitHubPath(data.document.github_path ?? null);
        setGitHubLastSyncedAt(data.document.last_synced_at ?? null);

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
    if (!id || !githubRepo || !githubPath) {
      setGitHubSyncStatus("unknown");
      return;
    }

    let cancelled = false;

    async function run() {
      await loadGitHubStatus();
    }

    void run();

    return () => {
      cancelled = true;
      if (cancelled) {
        return;
      }
    };
  }, [id, githubRepo, githubBranch, githubPath]);

  useEffect(() => {
    setPresencePeers([]);
  }, [id]);

  useEffect(() => {
    if (!initialized || !id || noAccess) {
      return;
    }

    const initialContent = content;
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    yDocRef.current = doc;
    awarenessRef.current = awareness;
    setCollabDoc(doc);
    setCollabAwareness(awareness);

    const wsUrl = resolveCollabWebSocketUrl(id);
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote" || origin === "seed") {
        return;
      }

      const activeSocket = wsRef.current;
      if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
        const framed = new Uint8Array(update.length + 1);
        framed[0] = WS_MESSAGE_SYNC;
        framed.set(update, 1);
        activeSocket.send(framed);
      }
    };

    const handleAwarenessChange = (
      changes: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === "remote") {
        return;
      }

      const activeSocket = wsRef.current;
      if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
        return;
      }

      const changedClients = [...changes.added, ...changes.updated, ...changes.removed];
      if (changedClients.length === 0) {
        return;
      }

      const encoded = encodeAwarenessUpdate(awareness, changedClients);
      const framed = new Uint8Array(encoded.length + 1);
      framed[0] = WS_MESSAGE_AWARENESS;
      framed.set(encoded, 1);
      activeSocket.send(framed);
    };

    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        try {
          const parsed = JSON.parse(event.data) as CollabMessage;

          if (parsed.type === "presence-snapshot") {
            setPresencePeers(Array.isArray(parsed.peers) ? parsed.peers : []);
            return;
          }

          if (parsed.type === "comment-event" && parsed.documentId === id) {
            setCommentActivityCount((current) => current + 1);
            void loadCommentThreads({ resetNotification: false });
            void loadNotifications(10);
            return;
          }
        } catch {
          return;
        }

        return;
      }

      const payload = toUint8Array(event.data);
      if (!payload || payload.length === 0) {
        return;
      }

      const type = payload[0];
      const message = payload.slice(1);

      if (type === WS_MESSAGE_SYNC) {
        Y.applyUpdate(doc, message, "remote");
        return;
      }

      if (type === WS_MESSAGE_AWARENESS) {
        applyAwarenessUpdate(awareness, message, "remote");
      }
    };

    const handleOpen = () => {
      const initialAwareness = encodeAwarenessUpdate(awareness, [awareness.clientID]);
      const framed = new Uint8Array(initialAwareness.length + 1);
      framed[0] = WS_MESSAGE_AWARENESS;
      framed.set(initialAwareness, 1);
      ws.send(framed);
    };

    ws.addEventListener("message", handleMessage);
    ws.addEventListener("open", handleOpen);
    doc.on("update", handleDocUpdate);
    awareness.on("change", handleAwarenessChange);

    // Seed collaboration document only when empty.
    const fragment = doc.getXmlFragment("content");
    if (fragment.length === 0 && content.trim().length > 0) {
      doc.transact(() => {
        const node = new Y.XmlElement("p");
        node.insert(0, [new Y.XmlText(initialContent)]);
        fragment.insert(0, [node]);
      }, "seed");
    }

    return () => {
      ws.removeEventListener("message", handleMessage);
      ws.removeEventListener("open", handleOpen);
      doc.off("update", handleDocUpdate);
      awareness.off("change", handleAwarenessChange);
      removeAwarenessStates(awareness, [awareness.clientID], "disconnect");
      ws.close();

      yDocRef.current = null;
      wsRef.current = null;
      awarenessRef.current = null;
      setCollabDoc(null);
      setCollabAwareness(null);
      doc.destroy();
    };
  }, [id, initialized, noAccess]);

  useEffect(() => {
    const awareness = awarenessRef.current;
    if (!awareness || !currentUser) {
      return;
    }

    awareness.setLocalStateField("user", {
      name: getDisplayName(currentUser),
      color: colorFromKey(currentUser.id),
    });
    awareness.setLocalStateField("userId", currentUser.id);
    awareness.setLocalStateField("name", currentUser.name ?? null);
    awareness.setLocalStateField("email", currentUser.email ?? null);
    awareness.setLocalStateField("avatarUrl", currentUser.avatar_url ?? null);
    awareness.setLocalStateField("typing", false);
    awareness.setLocalStateField("contextLabel", null);
    awareness.setLocalStateField("updatedAt", Date.now());
  }, [collabAwareness, currentUser]);

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
        const saved = await autosave(title, content);
        if (!saved) {
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
    setContent(nextContent);
  }

  async function handleManualSaveCheckpoint() {
    if (!canEdit) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setSavingStatus("saving");
    setError(null);

    try {
      const saved = await autosave(title, content);
      if (!saved) {
        setSavingStatus("idle");
        return;
      }

      lastSavedRef.current = { title, content };

      const response = await fetch(`/api/docs/${id}/version`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          title,
          content,
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setError(data.error ?? "Failed to create version checkpoint");
        setSavingStatus("idle");
        return;
      }

      setSavingStatus("saved");
    } catch {
      setError("Failed to save document");
      setSavingStatus("idle");
    }
  }

  const remotePresencePeers = currentUser
    ? presencePeers.filter((peer) => peer.userId !== currentUser.id)
    : presencePeers;

  const sortedPresencePeers = useMemo(
    () =>
      [...remotePresencePeers].sort(
        (left, right) => Number(right.typing) - Number(left.typing) || right.updatedAt - left.updatedAt,
      ),
    [remotePresencePeers],
  );

  const topCursorIds = useMemo(
    () => new Set(sortedPresencePeers.slice(0, 3).map((peer) => peer.userId ?? peer.connectionId)),
    [sortedPresencePeers],
  );

  const typingPeers = remotePresencePeers.filter((peer) => peer.typing);
  const visiblePresencePeers = sortedPresencePeers.slice(0, 3);
  const overflowPresenceCount = Math.max(0, sortedPresencePeers.length - visiblePresencePeers.length);
  const participantCount = (currentUser ? 1 : 0) + remotePresencePeers.length;

  const typingLabel = useMemo(() => {
    if (typingPeers.length === 0) {
      return null;
    }

    if (typingPeers.length === 1) {
      const context = typingPeers[0].contextLabel?.trim();
      return context ? `${getDisplayName(typingPeers[0])} is editing ${context}...` : `${getDisplayName(typingPeers[0])} is typing...`;
    }

    const context = typingPeers[0].contextLabel?.trim();
    return context
      ? `${getDisplayName(typingPeers[0])} and ${typingPeers.length - 1} others are editing ${context}...`
      : `${getDisplayName(typingPeers[0])} and ${typingPeers.length - 1} others are typing...`;
  }, [typingPeers]);

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
          ...csrfHeaders(),
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

  function formatVersionTime(value: number): string {
    return new Date(value).toLocaleString();
  }

  function getVersionLabel(version: DocumentVersion): string {
    if (version.type === "manual") {
      return "Manual save";
    }

    if (version.type === "restore") {
      return version.label || "Restored version";
    }

    if (version.type === "auto") {
      return "Auto snapshot";
    }

    return version.label || version.title || "Untitled";
  }

  async function loadVersions() {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await fetch(`/api/docs/${id}/versions`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        versions?: DocumentVersion[];
      };

      if (!response.ok || !data.success) {
        setHistoryError(data.error ?? "Failed to load versions");
        return;
      }

      const nextVersions = Array.isArray(data.versions) ? data.versions : [];
      setVersions(nextVersions);
      setSelectedVersionId((previous) => previous ?? nextVersions[0]?.id ?? null);
      setCompareLeftId((previous) => previous ?? nextVersions[0]?.id ?? null);
      setCompareRightId((previous) => previous ?? nextVersions[1]?.id ?? nextVersions[0]?.id ?? null);
    } catch {
      setHistoryError("Failed to load versions");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openHistoryPanel() {
    setHistoryOpen(true);
    await loadVersions();
  }

  async function handleCompareVersions() {
    if (!compareLeftId || !compareRightId) {
      setCompareError("Select two versions to compare");
      return;
    }

    if (compareLeftId === compareRightId) {
      setCompareError("Choose two different versions");
      return;
    }

    setCompareLoading(true);
    setCompareError(null);

    try {
      const response = await fetch(`/api/docs/${id}/compare?v1=${encodeURIComponent(compareLeftId)}&v2=${encodeURIComponent(compareRightId)}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as {
        error?: string;
        old?: string;
        new?: string;
      };

      if (!response.ok) {
        setCompareError(data.error ?? "Failed to compare versions");
        return;
      }

      setCompareLeftContent(data.old ?? "");
      setCompareRightContent(data.new ?? "");
    } catch {
      setCompareError("Failed to compare versions");
    } finally {
      setCompareLoading(false);
    }
  }

  async function handleRestoreVersion(versionId: string) {
    const confirmed = window.confirm("Restore this version? The restored content will be saved as a new version.");
    if (!confirmed) {
      return;
    }

    setHistoryError(null);
    setError(null);

    try {
      const response = await fetch(`/api/docs/${id}/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ versionId }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        document?: { title: string | null; content: string | null };
      };

      if (!response.ok || !data.success) {
        setHistoryError(data.error ?? "Failed to restore version");
        return;
      }

      if (data.document) {
        const nextTitle = data.document.title || "Untitled";
        const nextContent = data.document.content || "";
        setTitle(nextTitle);
        setContent(nextContent);
        lastSavedRef.current = { title: nextTitle, content: nextContent };
        setSavingStatus("saved");
        // Ensure editor state is synchronized by forcing a re-render
        // The RichTextEditor component will update via the value prop change
      }

      await loadVersions();
      setShareSuccess("Version restored");
    } catch {
      setHistoryError("Failed to restore version");
    }
  }

  function handleSelectVersion(versionId: string) {
    setSelectedVersionId(versionId);
  }

  function formatCommentTime(value: number): string {
    return new Date(value).toLocaleString();
  }

  function formatNotificationTime(value: number): string {
    return new Date(value).toLocaleString();
  }

  async function loadNotifications(limit = 10) {
    setNotificationsLoading(true);
    setNotificationsError(null);

    try {
      const response = await fetch(`/api/notifications?limit=${limit}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        unreadCount?: number;
        notifications?: NotificationItem[];
      };

      if (!response.ok || !data.success) {
        setNotificationsError(data.error ?? "Failed to load notifications");
        return;
      }

      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadNotificationCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch {
      setNotificationsError("Failed to load notifications");
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function markNotificationAsRead(notificationId: string) {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ notificationId }),
      });

      const data = (await response.json()) as { success?: boolean; unreadCount?: number };
      if (!response.ok || !data.success) {
        return;
      }

      setUnreadNotificationCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId
            ? {
                ...item,
                read_at: Date.now(),
              }
            : item,
        ),
      );
    } catch {
      // Keep UI responsive even if read-sync fails.
    }
  }

  async function markAllNotificationsAsRead() {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({ all: true }),
      });

      const data = (await response.json()) as { success?: boolean; unreadCount?: number };
      if (!response.ok || !data.success) {
        return;
      }

      setUnreadNotificationCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? Date.now() })));
    } catch {
      // Keep UI responsive even if read-sync fails.
    }
  }

  function emitCommentEvent(threadId: string, kind: "created" | "replied" | "resolved") {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: "comment-event",
        documentId: id,
        threadId,
        kind,
        at: Date.now(),
      }),
    );
  }

  function openThread(threadId: string, options?: { x?: number; y?: number }) {
    const thread = commentThreads.find((item) => item.id === threadId);
    if (!thread) {
      return;
    }

    setActiveCommentThreadId(threadId);
    setCommentActivityCount(0);
    const nextFocusKey = Date.now();
    setCommentFocusKey(nextFocusKey);
    setFocusCommentTarget({
      threadId,
      from: thread.selection_from,
      to: thread.selection_to,
      key: nextFocusKey,
    });

    if (typeof options?.x === "number" && typeof options?.y === "number") {
      setCommentPopover({
        threadId,
        x: options.x,
        y: options.y,
      });
    }
  }

  async function loadCommentThreads(options?: { resetNotification?: boolean }) {
    setCommentsLoading(true);
    setCommentError(null);

    try {
      const response = await fetch(`/api/comments/${id}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        threads?: CommentThread[];
      };

      if (!response.ok || !data.success) {
        setCommentError(data.error ?? "Failed to load comments");
        return;
      }

      const nextThreads = Array.isArray(data.threads) ? data.threads : [];
      setCommentThreads(nextThreads);
      setActiveCommentThreadId((current) => {
        if (current && nextThreads.some((thread) => thread.id === current)) {
          return current;
        }

        return nextThreads.find((thread) => !thread.resolved)?.id ?? nextThreads[0]?.id ?? null;
      });

      if (options?.resetNotification) {
        setCommentActivityCount(0);
      }
    } catch {
      setCommentError("Failed to load comments");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function handleCreateCommentThread() {
    if (!canEdit) {
      return;
    }

    const content = commentDraft.trim();
    if (!selectedCommentRange || !content) {
      setCommentError("Select text and write a comment to create a thread");
      return;
    }

    setCommentError(null);

    try {
      const response = await fetch("/api/comments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          documentId: id,
          content,
          selectionRange: {
            from: selectedCommentRange.from,
            to: selectedCommentRange.to,
            text: selectedCommentRange.text,
            contextBefore: selectedCommentRange.contextBefore,
            contextAfter: selectedCommentRange.contextAfter,
          },
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        threadId?: string;
      };

      if (!response.ok || !data.success || !data.threadId) {
        setCommentError(data.error ?? "Failed to create comment thread");
        return;
      }

      setPendingCommentAnchor({
        threadId: data.threadId,
        range: {
          from: selectedCommentRange.from,
          to: selectedCommentRange.to,
        },
      });
      setActiveCommentThreadId(data.threadId);
      setCommentDraft("");
      emitCommentEvent(data.threadId, "created");
      await loadCommentThreads({ resetNotification: true });
    } catch {
      setCommentError("Failed to create comment thread");
    }
  }

  async function handleReplyToThread(threadId: string) {
    if (!canEdit) {
      return;
    }

    const content = (replyDrafts[threadId] ?? "").trim();
    if (!content) {
      setCommentError("Reply cannot be empty");
      return;
    }

    setCommentError(null);

    try {
      const response = await fetch("/api/comments/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          threadId,
          content,
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        setCommentError(data.error ?? "Failed to post reply");
        return;
      }

      setReplyDrafts((current) => ({
        ...current,
        [threadId]: "",
      }));
      emitCommentEvent(threadId, "replied");
      await loadCommentThreads({ resetNotification: true });
    } catch {
      setCommentError("Failed to post reply");
    }
  }

  async function handleSetThreadResolved(threadId: string, resolved: boolean) {
    if (!canEdit) {
      return;
    }

    setCommentError(null);

    try {
      const response = await fetch("/api/comments/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          threadId,
          resolved,
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        setCommentError(data.error ?? "Failed to update thread status");
        return;
      }

      setCommentThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                resolved,
              }
            : thread,
        ),
      );
      emitCommentEvent(threadId, "resolved");
      await loadCommentThreads({ resetNotification: true });
    } catch {
      setCommentError("Failed to update thread status");
    }
  }

  useEffect(() => {
    if (!initialized || !id || noAccess) {
      return;
    }

    void loadCommentThreads();
    void loadNotifications(10);
  }, [id, initialized, noAccess]);

  useEffect(() => {
    const handleOutsideClick = () => {
      setCommentPopover(null);
    };

    window.addEventListener("click", handleOutsideClick);

    return () => {
      window.removeEventListener("click", handleOutsideClick);
    };
  }, []);

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
          ...csrfHeaders(),
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

  async function handleResendVerification() {
    setShareError(null);
    setShareSuccess(null);
    setResendVerificationBusy(true);

    try {
      const response = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: csrfHeaders(),
      });

      const data = (await response.json()) as { success?: boolean; error?: string; alreadyVerified?: boolean };
      if (!response.ok || !data.success) {
        setShareError(data.error ?? "Failed to resend verification email");
        return;
      }

      if (data.alreadyVerified) {
        setShareSuccess("Your email is already verified.");
        setVerificationHint(null);
        return;
      }

      setShareSuccess("Verification email sent. Check your inbox.");
    } catch {
      setShareError("Failed to resend verification email");
    } finally {
      setResendVerificationBusy(false);
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
          ...csrfHeaders(),
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

  async function loadGitHubRepos() {
    setGitHubLoadingRepos(true);
    setGitHubError(null);

    try {
      const response = await fetch(`/api/docs/${id}/connect-github`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        repos?: GitHubRepoOption[];
        mapping?: {
          github_repo?: string | null;
          github_branch?: string | null;
          github_path?: string | null;
        };
      };

      if (!response.ok || !data.success) {
        setGitHubAccountConnected(false);
        setGitHubError(data.error ?? "Failed to load GitHub repositories");
        return;
      }

      const repos = Array.isArray(data.repos) ? data.repos : [];
      const mapping = data.mapping;

      setGitHubAccountConnected(true);
      setGitHubRepoOptions(repos);
      setGitHubSelectedRepo(mapping?.github_repo ?? githubRepo ?? repos[0]?.full_name ?? "");
      setGitHubSelectedBranch(mapping?.github_branch ?? githubBranch ?? repos[0]?.default_branch ?? "main");
      setGitHubSelectedPath(mapping?.github_path ?? githubPath ?? "docs/README.md");
    } catch {
      setGitHubError("Failed to load GitHub repositories");
    } finally {
      setGitHubLoadingRepos(false);
    }
  }

  async function loadGitHubStatus() {
    if (!githubRepo || !githubPath) {
      setGitHubSyncStatus("unknown");
      return;
    }

    setGitHubSyncStatusLoading(true);

    try {
      const response = await fetch(`/api/docs/${id}/github-status`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await response.json()) as {
        success?: boolean;
        status?: GitHubSyncStatus;
        lastSyncedAt?: number | null;
      };

      if (!response.ok || !data.success) {
        setGitHubSyncStatus("unknown");
        return;
      }

      setGitHubSyncStatus(data.status === "synced" || data.status === "diverged" ? data.status : "unknown");
      setGitHubLastSyncedAt(typeof data.lastSyncedAt === "number" ? data.lastSyncedAt : null);
    } catch {
      setGitHubSyncStatus("unknown");
    } finally {
      setGitHubSyncStatusLoading(false);
    }
  }

  async function openGitHubModal() {
    setGitHubModalOpen(true);
    setGitHubError(null);
    setGitHubSuccess(null);
    setGitHubPreviewReady(false);
    setGitHubPreviewDiff([]);
    await loadGitHubRepos();
    await loadGitHubStatus();
  }

  async function handleConnectGitHub() {
    const repo = githubSelectedRepo.trim();
    const branch = githubSelectedBranch.trim() || "main";
    const path = githubSelectedPath.trim();

    if (!repo) {
      setGitHubError("Repository is required");
      return;
    }

    if (!path) {
      setGitHubError("Path is required");
      return;
    }

    setGitHubSaving(true);
    setGitHubError(null);
    setGitHubSuccess(null);

    try {
      const response = await fetch(`/api/docs/${id}/connect-github`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          repo,
          branch,
          path,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        mapping?: {
          github_repo?: string | null;
          github_branch?: string | null;
          github_path?: string | null;
        };
      };

      if (!response.ok || !data.success) {
        setGitHubError(data.error ?? "Failed to connect GitHub repository");
        return;
      }

      setGitHubAccountConnected(true);
      setGitHubRepo(data.mapping?.github_repo ?? repo);
      setGitHubBranch(data.mapping?.github_branch ?? branch);
      setGitHubPath(data.mapping?.github_path ?? path);
      setGitHubSuccess("GitHub repository connected");
      setGitHubSyncStatus("unknown");
      setGitHubPreviewReady(false);
      setGitHubPreviewDiff([]);
    } catch {
      setGitHubError("Failed to connect GitHub repository");
    } finally {
      setGitHubSaving(false);
    }
  }

  async function handlePreviewPullFromGitHub() {
    if (!githubRepo || !githubPath) {
      setGitHubError("Connect a GitHub repository first");
      return;
    }

    setGitHubPreviewLoading(true);
    setGitHubError(null);
    setGitHubSuccess(null);

    try {
      const response = await fetch(`/api/docs/${id}/pull-github?preview=1`, {
        method: "POST",
        headers: {
          ...csrfHeaders(),
        },
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        status?: GitHubSyncStatus;
        conflict?: boolean;
        diff?: DocumentDiffChange[];
      };

      if (!response.ok || !data.success) {
        setGitHubError(data.error ?? "Failed to preview GitHub changes");
        return;
      }

      setGitHubPreviewDiff(Array.isArray(data.diff) ? data.diff : []);
      setGitHubPreviewReady(true);
      setGitHubSyncStatus(data.status === "synced" || data.status === "diverged" ? data.status : "unknown");
      if (data.conflict) {
        setGitHubSuccess("Remote content diverged. Review the preview before pulling.");
      } else {
        setGitHubSuccess("Preview loaded. You can pull the latest content.");
      }
    } catch {
      setGitHubError("Failed to preview GitHub changes");
    } finally {
      setGitHubPreviewLoading(false);
    }
  }

  async function handlePullFromGitHub() {
    if (!githubPreviewReady) {
      setGitHubError("Preview changes before pulling.");
      return;
    }

    setGitHubPulling(true);
    setGitHubError(null);
    setGitHubSuccess(null);

    try {
      const response = await fetch(`/api/docs/${id}/pull-github`, {
        method: "POST",
        headers: {
          ...csrfHeaders(),
        },
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        code?: string;
        document?: {
          title?: string | null;
          content?: string | null;
        };
      };

      if (!response.ok || !data.success) {
        if (response.status === 409 && data.code === "github_conflict") {
          setGitHubError("Conflict detected. Preview changes again before pulling.");
          setGitHubSyncStatus("diverged");
          return;
        }

        setGitHubError(data.error ?? "Failed to pull from GitHub");
        return;
      }

      if (data.document?.content !== undefined) {
        const nextContent = data.document.content ?? "";
        setContent(nextContent);
        lastSavedRef.current = {
          title,
          content: nextContent,
        };
      }

      setSavingStatus("saved");
      setGitHubPreviewReady(false);
      setGitHubPreviewDiff([]);
      setGitHubSyncStatus("synced");
      setGitHubSuccess("Pulled latest content from GitHub");
      await loadGitHubStatus();
    } catch {
      setGitHubError("Failed to pull from GitHub");
    } finally {
      setGitHubPulling(false);
    }
  }

  function formatGitHubSyncBadge(status: GitHubSyncStatus): { label: string; classes: string } {
    if (status === "synced") {
      return {
        label: "GitHub synced",
        classes: "bg-emerald-100 text-emerald-700",
      };
    }

    if (status === "diverged") {
      return {
        label: "GitHub diverged",
        classes: "bg-amber-100 text-amber-700",
      };
    }

    return {
      label: "GitHub unknown",
      classes: "bg-slate-100 text-slate-700",
    };
  }

  if (noAccess) {
    return (
      <main className="min-h-screen bg-[#f7f6f3] text-slate-900">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4">
          <div className="w-full rounded-2xl border border-black/10 bg-white p-6 text-center shadow-sm">
            <h1 className="text-xl font-semibold">No access</h1>
            <p className="mt-2 text-sm text-slate-600">You do not have permission to view this document.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f3] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-black/5 bg-white/85 px-4 py-3 backdrop-blur md:px-6">
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full max-w-2xl rounded-xl border border-black/10 bg-white px-3 py-2 text-base font-medium outline-none placeholder:text-slate-400 focus:border-black/20"
            aria-label="Document title"
            disabled={loading || !canEdit}
          />

          <div className="flex items-center gap-3">
            {currentUser || remotePresencePeers.length > 0 ? (
              <div className="flex items-center gap-1" title={`${participantCount} participants in this document`}>
                {currentUser ? (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-sm"
                    style={{ backgroundColor: colorFromKey(currentUser.id) }}
                    aria-label="You"
                  >
                    {getInitials(getDisplayName(currentUser))}
                  </div>
                ) : null}
                {visiblePresencePeers.map((peer) => {
                  const label = getDisplayName(peer);
                  const focusId = peer.userId ?? peer.connectionId;

                  return (
                    <button
                      type="button"
                      key={`header-${peer.connectionId}`}
                      className={`-ml-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-sm first:ml-0 ${highlightedPresenceId === focusId ? "ring-2 ring-sky-300" : ""}`}
                      style={{ backgroundColor: peer.color }}
                      aria-label={label}
                      onMouseEnter={() => setHighlightedPresenceId(focusId)}
                      onMouseLeave={() => setHighlightedPresenceId((current) => (current === focusId ? null : current))}
                      onClick={() => {
                        if (!peer.cursor) {
                          return;
                        }

                        setFocusedRemoteCursor({
                          id: focusId,
                          pos: peer.cursor.head,
                          key: Date.now(),
                        });
                        setHighlightedPresenceId(focusId);
                      }}
                    >
                      {getInitials(label)}
                    </button>
                  );
                })}
                {overflowPresenceCount > 0 ? (
                  <div className="-ml-1 flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-white bg-slate-800 px-1.5 text-xs font-semibold text-white shadow-sm">
                    +{overflowPresenceCount}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              {githubRepo ? (
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${formatGitHubSyncBadge(githubSyncStatus).classes}`}>
                  {githubSyncStatusLoading ? "Checking GitHub..." : formatGitHubSyncBadge(githubSyncStatus).label}
                </span>
              ) : null}
              {githubAccountConnected && !githubLinked ? (
                <p className="text-[11px] leading-tight text-slate-500">GitHub account connected, document not linked yet</p>
              ) : null}
            </div>
            <div className="relative">
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => {
                  const nextOpen = !notificationsOpen;
                  setNotificationsOpen(nextOpen);
                  if (nextOpen) {
                    void loadNotifications(12);
                  }
                }}
                className="relative rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Notifications
                {unreadNotificationCount > 0 ? (
                  <span className="ml-2 rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div
                  className="absolute right-0 z-50 mt-2 w-96 rounded-2xl border border-black/10 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.12)]"
                  onClick={(event) => event.stopPropagation()}
                >
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-black/5 pb-2">
                    <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void markAllNotificationsAsRead();
                        }}
                        className="rounded-md border border-black/10 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Mark all read
                      </button>
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        className="rounded-md border border-black/10 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  {notificationsLoading ? <p className="text-sm text-slate-500">Loading notifications...</p> : null}
                  {notificationsError ? <p className="text-sm text-rose-600">{notificationsError}</p> : null}

                  {!notificationsLoading && notifications.length === 0 ? (
                    <p className="text-sm text-slate-500">No notifications yet.</p>
                  ) : null}

                  <div className="max-h-80 space-y-2 overflow-auto pr-1">
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => {
                          void markNotificationAsRead(notification.id);
                          setNotificationsOpen(false);

                          if (notification.thread_id) {
                            openThread(notification.thread_id);
                          }
                        }}
                          className={`w-full rounded-xl border px-2 py-2 text-left transition hover:bg-slate-50 ${notification.read_at ? "border-black/10 bg-white" : "border-sky-200 bg-sky-50"}`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-700">{notification.type === "mention" ? "Mention" : "Comment"}</p>
                          <p className="text-[11px] text-slate-500">{formatNotificationTime(notification.created_at)}</p>
                        </div>
                        <p className="text-sm text-slate-800">{notification.message}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
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
                className="rounded-xl border border-black/10 bg-white px-2 py-2 text-sm text-slate-700 outline-none focus:border-black/20 disabled:cursor-not-allowed disabled:opacity-60"
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
                  void openGitHubModal();
                }}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {githubLinked ? "Manage GitHub link" : "Link GitHub repo"}
              </button>
            ) : null}
            {accessRole === "owner" ? (
              <button
                type="button"
                onClick={() => {
                  void openHistoryPanel();
                }}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                History
              </button>
            ) : null}
            {accessRole === "owner" ? (
              <button
                type="button"
                onClick={() => {
                  void openLogsPanel();
                }}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Share
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  void handleManualSaveCheckpoint();
                }}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Save checkpoint
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

        {githubRepo ? (
          <div className="border-b border-indigo-200 bg-indigo-50 px-4 py-2 text-xs text-indigo-800 md:px-6">
            Linked GitHub source: {githubRepo} • {githubBranch || "main"} • {githubPath || "(no path)"}
            {githubLastSyncedAt ? ` • Last synced ${new Date(githubLastSyncedAt).toLocaleString()}` : ""}
          </div>
        ) : null}

        <section className="flex-1 p-4 md:p-6">
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active collaborators</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {currentUser ? (
                    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: colorFromKey(currentUser.id) }}
                        title={getDisplayName(currentUser)}
                      >
                        {getInitials(getDisplayName(currentUser))}
                      </div>
                      <span className="text-sm font-medium text-slate-700">You</span>
                    </div>
                  ) : null}
                  {remotePresencePeers.map((peer) => {
                    const label = getDisplayName(peer);

                    return (
                      <div key={peer.connectionId} className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                        {peer.avatarUrl ? (
                          <img
                            src={peer.avatarUrl}
                            alt={label}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                            style={{ backgroundColor: peer.color }}
                            title={label}
                          >
                            {getInitials(label)}
                          </div>
                        )}
                        <div className="leading-tight">
                          <p className="text-sm font-medium text-slate-700">{label}</p>
                          <p className="text-[11px] text-slate-500">{peer.typing ? "Typing..." : "Online"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {typingPeers.length > 0 ? (
                <p className="text-sm font-medium text-slate-600">{typingLabel}</p>
              ) : (
                <p className="text-sm text-slate-500">Live cursor tracking is active.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <RichTextEditor
                value={content}
                onChange={handleContentChange}
                onCommentSelectionChange={setSelectedCommentRange}
                onPresenceStateChange={publishPresenceUpdate}
                highlightedPresenceId={highlightedPresenceId}
                focusedRemoteCursor={focusedRemoteCursor}
                remotePresenceCursors={sortedPresencePeers.map((peer) => {
                  const focusId = peer.userId ?? peer.connectionId;
                  return {
                    id: focusId,
                    name: getDisplayName(peer),
                    color: peer.color,
                    cursor: peer.cursor,
                    dimmed: !topCursorIds.has(focusId),
                  };
                })}
                onCommentMarkClick={(threadId, rect) => {
                  openThread(threadId, rect ? { x: rect.left, y: rect.bottom + 8 } : undefined);
                }}
                commentAnchors={commentAnchors}
                pendingCommentAnchor={pendingCommentAnchor}
                focusCommentTarget={focusCommentTarget}
                activeCommentThreadId={activeCommentThreadId}
                disabled={loading || !canEdit}
                documentId={id}
                csrfToken={getCsrfToken()}
                collaboration={
                  collabDoc && collabAwareness && currentUser
                    ? {
                        doc: collabDoc,
                        awareness: collabAwareness,
                        user: {
                          name: getDisplayName(currentUser),
                          color: colorFromKey(currentUser.id),
                        },
                      }
                    : undefined
                }
              />
              {!canEdit && !loading ? <p className="mt-3 text-sm text-slate-500">You have viewer access (read-only).</p> : null}
            </div>

            <aside className="comments-sidebar rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-4 lg:h-fit">
              <div className="mb-3 border-b border-slate-200 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Comments</h3>
                    {commentActivityCount > 0 ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{commentActivityCount} new</span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResolvedThreads((current) => !current);
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {showResolvedThreads ? "Hide resolved" : "Show resolved"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCommentActivityCount(0);
                        void loadCommentThreads({ resetNotification: true });
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {resolvedCommentCount > 0 ? <p className="mt-2 text-[11px] text-slate-500">{resolvedCommentCount} resolved thread{resolvedCommentCount === 1 ? "" : "s"}.</p> : null}

                <p className="mt-2 text-xs text-slate-500">
                  {selectedCommentRange
                    ? `Selection: ${Math.max(0, selectedCommentRange.to - selectedCommentRange.from)} chars`
                    : "Select text in editor to start a thread."}
                </p>

                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Add a comment on selected text..."
                  disabled={!canEdit}
                  className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
                />

                <button
                  type="button"
                  onClick={() => {
                    void handleCreateCommentThread();
                  }}
                  disabled={!canEdit || !selectedCommentRange || commentDraft.trim().length === 0}
                  className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Create thread
                </button>

                {commentError ? <p className="mt-2 text-xs text-red-600">{commentError}</p> : null}
              </div>

              {commentsLoading ? <p className="text-sm text-slate-500">Loading comments...</p> : null}

              {!commentsLoading && visibleCommentThreads.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {commentThreads.length === 0
                    ? "No comments yet. Select text to start a discussion."
                    : showResolvedThreads
                      ? "No open comment threads yet."
                      : "All comment threads are resolved. Turn on Show resolved to review them."}
                </p>
              ) : null}

              <div className="space-y-3">
                {visibleCommentThreads.map((thread) => {
                  const isActive = activeCommentThreadId === thread.id;
                  const threadDetails = thread.comments[0] ? getCommentAuthorDetails(thread.comments[0]) : null;

                  return (
                    <article
                      key={thread.id}
                      className={`rounded-xl border p-2 transition ${isActive ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"} ${thread.resolved ? "opacity-60" : "opacity-100"}`}
                    >
                      <button
                        type="button"
                        onClick={() => openThread(thread.id)}
                        className="mb-2 block w-full rounded-md px-1 py-1 text-left hover:bg-slate-100"
                      >
                        <div className="flex items-start gap-2">
                          {threadDetails ? (
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: threadDetails.color }}>
                              {threadDetails.initials}
                            </div>
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-700">Anchor range: {thread.selection_from} to {thread.selection_to}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{formatCommentTime(thread.created_at)}</p>
                            {thread.resolved ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Resolved</p> : null}
                          </div>
                        </div>
                        {thread.selection_text ? <p className="mt-1 text-xs italic text-slate-600">&quot;{thread.selection_text}&quot;</p> : null}
                        {getCommentContextLabel(thread) ? <p className="mt-1 text-[11px] text-slate-500">{getCommentContextLabel(thread)}</p> : null}
                      </button>

                      <div className="space-y-2">
                        {thread.comments.map((comment) => (
                          <div key={comment.id} className="flex gap-2 rounded-md bg-slate-100 px-2 py-1.5">
                            <div
                              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                              style={{ backgroundColor: getCommentAuthorDetails(comment).color }}
                            >
                              {getCommentAuthorDetails(comment).initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-700">{getCommentAuthorDetails(comment).label}</p>
                                <p className="text-[11px] text-slate-500">{formatCommentTime(comment.created_at)}</p>
                              </div>
                              <p className="text-sm text-slate-800">{comment.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={replyDrafts[thread.id] ?? ""}
                          onChange={(event) =>
                            setReplyDrafts((current) => ({
                              ...current,
                              [thread.id]: event.target.value,
                            }))
                          }
                          placeholder={canEdit ? "Write a reply..." : "Read-only"}
                          disabled={!canEdit}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            void handleReplyToThread(thread.id);
                          }}
                          disabled={!canEdit || (replyDrafts[thread.id] ?? "").trim().length === 0}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleSetThreadResolved(thread.id, !Boolean(thread.resolved));
                          }}
                          disabled={!canEdit}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {thread.resolved ? "Reopen" : "Resolve"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </aside>
          </div>

          {commentPopover ? (
            (() => {
              const thread = commentThreads.find((item) => item.id === commentPopover.threadId);
              if (!thread) {
                return null;
              }

              const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
              const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
              const left = viewportWidth > 0 ? Math.min(viewportWidth - 336, Math.max(12, commentPopover.x)) : Math.max(12, commentPopover.x);
              const top = viewportHeight > 0 ? Math.min(viewportHeight - 260, Math.max(12, commentPopover.y)) : Math.max(12, commentPopover.y);

              return (
                <div
                  className="fixed z-40 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
                  style={{ left, top }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Thread</p>
                    <button
                      type="button"
                      onClick={() => setCommentPopover(null)}
                      className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                    >
                      Close
                    </button>
                  </div>

                  {thread.selection_text ? <p className="mb-2 text-xs italic text-slate-600">&quot;{thread.selection_text}&quot;</p> : null}
                  {getCommentContextLabel(thread) ? <p className="mb-2 text-[11px] text-slate-500">{getCommentContextLabel(thread)}</p> : null}

                  <div className="max-h-48 space-y-2 overflow-auto pr-1">
                    {thread.comments.map((comment) => (
                      <div key={comment.id} className="flex gap-2 rounded-md bg-slate-100 px-2 py-1.5">
                        <div
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                          style={{ backgroundColor: getCommentAuthorDetails(comment).color }}
                        >
                          {getCommentAuthorDetails(comment).initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-700">{getCommentAuthorDetails(comment).label}</p>
                          <p className="text-sm text-slate-800">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={replyDrafts[thread.id] ?? ""}
                      onChange={(event) =>
                        setReplyDrafts((current) => ({
                          ...current,
                          [thread.id]: event.target.value,
                        }))
                      }
                      placeholder={canEdit ? "Reply..." : "Read-only"}
                      disabled={!canEdit}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleReplyToThread(thread.id);
                      }}
                      disabled={!canEdit || (replyDrafts[thread.id] ?? "").trim().length === 0}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Send
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleSetThreadResolved(thread.id, !Boolean(thread.resolved));
                      }}
                      disabled={!canEdit}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {thread.resolved ? "Reopen" : "Resolve"}
                    </button>
                  </div>
                </div>
              );
            })()
          ) : null}
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
            {verificationHint ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-sm text-amber-700">{verificationHint}</p>
                <button
                  type="button"
                  onClick={() => {
                    void handleResendVerification();
                  }}
                  disabled={resendVerificationBusy}
                  className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resendVerificationBusy ? "Sending..." : "Resend verification email"}
                </button>
              </div>
            ) : null}

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

      {githubModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{githubLinked ? "Manage GitHub link" : "Link GitHub repo"}</h2>
                <p className="text-sm text-slate-500">
                  {githubLinked
                    ? "Update the repository, branch, or path used for document sync."
                    : "Choose a GitHub repository and path to sync this document."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGitHubModalOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Repository</span>
                <select
                  value={githubSelectedRepo}
                  onChange={(event) => {
                    const nextRepo = event.target.value;
                    setGitHubSelectedRepo(nextRepo);

                    const matched = githubRepoOptions.find((repo) => repo.full_name === nextRepo);
                    if (matched && (!githubSelectedBranch || githubSelectedBranch === "main")) {
                      setGitHubSelectedBranch(matched.default_branch || "main");
                    }
                  }}
                  disabled={githubLoadingRepos}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400 disabled:opacity-60"
                >
                  <option value="">Select repository</option>
                  {githubRepoOptions.map((repo) => (
                    <option key={repo.id} value={repo.full_name}>
                      {repo.full_name}{repo.private ? " (private)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Branch</span>
                  <input
                    type="text"
                    value={githubSelectedBranch}
                    onChange={(event) => setGitHubSelectedBranch(event.target.value)}
                    placeholder="main"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Path</span>
                  <input
                    type="text"
                    value={githubSelectedPath}
                    onChange={(event) => setGitHubSelectedPath(event.target.value)}
                    placeholder="docs/file.md"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                  />
                </label>
              </div>

              {githubError ? <p className="text-sm text-red-600">{githubError}</p> : null}
              {githubSuccess ? <p className="text-sm text-emerald-600">{githubSuccess}</p> : null}

              {githubPreviewDiff.length > 0 ? (
                <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 whitespace-pre-wrap text-slate-100">{githubPreviewDiff
                  .map((change) => {
                    if (change.added) {
                      return `+ ${change.value}`;
                    }

                    if (change.removed) {
                      return `- ${change.value}`;
                    }

                    return `  ${change.value}`;
                  })
                  .join("")}</pre>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void loadGitHubRepos();
                    }}
                    disabled={githubLoadingRepos}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                  >
                    {githubLoadingRepos ? "Loading repos..." : "Refresh repos"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void handleConnectGitHub();
                    }}
                    disabled={githubSaving || githubLoadingRepos}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {githubSaving ? "Connecting..." : "Connect"}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handlePreviewPullFromGitHub();
                    }}
                    disabled={githubPreviewLoading || !githubRepo || !githubPath}
                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60"
                  >
                    {githubPreviewLoading ? "Previewing..." : "Preview changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handlePullFromGitHub();
                    }}
                    disabled={githubPulling || !githubPreviewReady}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {githubPulling ? "Pulling..." : "Pull now"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Document history</h2>
                <p className="text-sm text-slate-500">Restore old versions or compare any two snapshots.</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 px-3 py-2">
                  <p className="text-sm font-medium text-slate-900">Versions</p>
                </div>
                {historyLoading ? (
                  <p className="px-3 py-4 text-sm text-slate-500">Loading versions...</p>
                ) : historyError ? (
                  <p className="px-3 py-4 text-sm text-red-600">{historyError}</p>
                ) : versions.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-500">No versions yet.</p>
                ) : (
                  <ul className="max-h-[24rem] divide-y divide-slate-200 overflow-auto">
                    {versions.map((version) => (
                      <li key={version.id} className="px-3 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">Version {version.version_number}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {getVersionLabel(version)} · {formatVersionTime(version.created_at)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">Created by {version.created_by || "Unknown"}</p>
                            {version.type ? <p className="mt-1 text-[11px] uppercase tracking-[0.18em] font-semibold text-slate-500">{version.type === "auto" ? "Auto" : version.type === "manual" ? "Manual" : "Restored"}</p> : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleSelectVersion(version.id)}
                              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCompareLeftId(version.id);
                                const fallbackVersionId = selectedVersionId && selectedVersionId !== version.id
                                  ? selectedVersionId
                                  : versions.find((candidate) => candidate.id !== version.id)?.id ?? version.id;

                                setCompareRightId(fallbackVersionId);
                                setCompareError(null);
                                setCompareLeftContent("");
                                setCompareRightContent("");
                              }}
                              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                              Compare
                            </button>
                            {accessRole === "owner" ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleRestoreVersion(version.id);
                                }}
                                className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                              >
                                Restore
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">Selected version</p>
                  {versions.find((version) => version.id === selectedVersionId) ? (
                    (() => {
                      const selectedVersion = versions.find((version) => version.id === selectedVersionId)!;
                      return (
                        <div className="mt-2 text-sm text-slate-600">
                          <p>Version {selectedVersion.version_number}</p>
                          <p>{selectedVersion.title || "Untitled"}</p>
                          <p>{formatVersionTime(selectedVersion.created_at)}</p>
                          <p>{selectedVersion.created_by || "Unknown author"}</p>
                        </div>
                      );
                    })()
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">Select a version to inspect it.</p>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">Compare versions</p>
                  {compareLeftVersion || compareRightVersion ? (
                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <p className="font-medium text-slate-700">Comparing:</p>
                      <p>
                        {compareLeftVersion ? `Version ${compareLeftVersion.version_number} (${getVersionTypeLabel(compareLeftVersion)})` : "Select first version"}
                      </p>
                      <p>{compareRightVersion ? `vs Version ${compareRightVersion.version_number} (${getVersionTypeLabel(compareRightVersion)})` : "vs select second version"}</p>
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-2">
                    <select
                      value={compareLeftId ?? ""}
                      onChange={(event) => setCompareLeftId(event.target.value || null)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                    >
                      <option value="">Select first version</option>
                      {versions.map((version) => (
                        <option key={version.id} value={version.id}>
                          Version {version.version_number}
                        </option>
                      ))}
                    </select>
                    <select
                      value={compareRightId ?? ""}
                      onChange={(event) => setCompareRightId(event.target.value || null)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                    >
                      <option value="">Select second version</option>
                      {versions.map((version) => (
                        <option key={version.id} value={version.id}>
                          Version {version.version_number}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCompareVersions();
                      }}
                      disabled={compareLoading}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {compareLoading ? "Comparing..." : "Compare"}
                    </button>
                  </div>

                  {compareError ? <p className="mt-3 text-sm text-red-600">{compareError}</p> : null}
                  {(compareLeftContent || compareRightContent) ? (
                    <div
                      className="prose max-w-none mt-3 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-800"
                      dangerouslySetInnerHTML={{ __html: diffHtml }}
                    />
                  ) : null}
                </div>
              </div>
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
