"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSession } from "@/lib/auth/session-client";
import { getCsrfToken } from "@/lib/security/csrf-client";
import type { User } from "@/types";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

function csrfHeaders(): Record<string, string> {
  return {
    "x-csrf-token": getCsrfToken(),
  };
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loadingSession, setLoadingSession] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [newNotificationsPulse, setNewNotificationsPulse] = useState(false);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    document_id: string;
    message: string;
    type: "comment" | "mention";
    read_at: number | null;
    created_at: number;
  }>>([]);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const previousUnreadCountRef = useRef(0);
  const notificationsSeededRef = useRef(false);
  const creatingDocumentRef = useRef(false);

  const navItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "My Docs", href: "/dashboard/mydocs" },
    { label: "AI Skills", href: "/dashboard/ai-skills" },
    { label: "Settings", href: "/dashboard/settings" },
    { label: "AI Settings", href: "/dashboard/ai-settings" },
  ] as const;

  function isActive(href: string): boolean {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }

    return pathname.startsWith(href);
  }

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const currentUser = await getSession();

      if (!mounted) {
        return;
      }

      if (!currentUser) {
        router.replace("/login");
        return;
      }

      if (currentUser.status !== "active") {
        router.replace("/onboarding");
        return;
      }

      setUser(currentUser);
      setLoadingSession(false);
    }

    void loadSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: csrfHeaders(),
      });
    } finally {
      router.replace("/login");
      router.refresh();
      setLoggingOut(false);
    }
  }

  async function handleCreateDocument() {
    if (creatingDocumentRef.current) {
      return;
    }

    creatingDocumentRef.current = true;
    setCreatingDocument(true);

    try {
      const response = await fetch("/api/docs/create", {
        method: "POST",
        headers: csrfHeaders(),
      });

      const data = (await response.json()) as { success?: boolean; id?: string; error?: string };

      if (!response.ok || !data.success || !data.id) {
        creatingDocumentRef.current = false;
        setCreatingDocument(false);
        return;
      }

      router.push(`/editor/${data.id}`);
    } catch {
      creatingDocumentRef.current = false;
      setCreatingDocument(false);
    }
  }

  async function loadNotifications(limit = 10) {
    if (!user) {
      return;
    }

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
        notifications?: Array<{
          id: string;
          document_id: string;
          message: string;
          type: "comment" | "mention";
          read_at: number | null;
          created_at: number;
        }>;
      };

      if (!response.ok || !data.success) {
        setNotificationsError(data.error ?? "Failed to load notifications");
        return;
      }

      const nextUnreadCount = typeof data.unreadCount === "number" ? data.unreadCount : 0;
      if (notificationsSeededRef.current && nextUnreadCount > previousUnreadCountRef.current) {
        setNewNotificationsPulse(true);
        window.setTimeout(() => {
          setNewNotificationsPulse(false);
        }, 900);
      }

      previousUnreadCountRef.current = nextUnreadCount;
      notificationsSeededRef.current = true;
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadNotificationCount(nextUnreadCount);
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

      const nextUnreadCount = typeof data.unreadCount === "number" ? data.unreadCount : 0;
      previousUnreadCountRef.current = nextUnreadCount;
      setUnreadNotificationCount(nextUnreadCount);
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
      // Ignore read-sync errors to keep UX responsive.
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

      const nextUnreadCount = typeof data.unreadCount === "number" ? data.unreadCount : 0;
      previousUnreadCountRef.current = nextUnreadCount;
      setUnreadNotificationCount(nextUnreadCount);
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? Date.now() })));
    } catch {
      // Ignore read-sync errors to keep UX responsive.
    }
  }

  function formatNotificationTime(value: number): string {
    return new Date(value).toLocaleString();
  }

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadNotifications(8);

    const intervalId = window.setInterval(() => {
      void loadNotifications(8);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user]);

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (notificationsRef.current?.contains(target)) {
        return;
      }

      setNotificationsOpen(false);
    };

    window.addEventListener("mousedown", handleOutsideClick);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [notificationsOpen]);

  if (loadingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-ink-faint">
        <span className="eyebrow">Opening workspace</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-rule bg-paper md:flex md:flex-col">
          <div className="flex h-14 items-center border-b border-rule px-6">
            <span className="font-display text-lg font-bold tracking-tight text-ink">Docsyra</span>
          </div>

          <nav className="flex-1 px-3 py-6">
            <div className="space-y-0.5">
              {navItems.map((item, index) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "flex items-center gap-3 rounded-sm border border-rule bg-paper-sunk px-3 py-2 text-sm font-medium text-ink"
                        : "flex items-center gap-3 rounded-sm border border-transparent px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-paper-sunk hover:text-ink"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-rule px-6 py-4">
            <p className="eyebrow text-ink-ghost">Document Workspace</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-rule bg-paper px-4 md:px-8">
            <div className="flex items-center gap-3 md:flex-1">
              <span className="font-display text-base font-bold tracking-tight text-ink md:hidden">
                Docsyra
              </span>
              <button
                type="button"
                onClick={() => void handleCreateDocument()}
                disabled={creatingDocument}
                className="hidden shrink-0 items-center gap-1.5 rounded-sm bg-ink px-3 py-1.5 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-60 md:inline-flex"
              >
                <span aria-hidden>+</span>
                {creatingDocument ? "Creating..." : "New doc"}
              </button>
              <input
                type="text"
                placeholder="Search documents"
                className="hidden h-9 w-full max-w-xs rounded-sm border border-rule bg-paper px-3 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay focus:outline-none focus:ring-0 focus:shadow-none md:block"
              />
            </div>
            <div className="flex items-center gap-2.5">
              <div className="relative" ref={notificationsRef}>
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
                  className={`relative rounded-sm border border-rule bg-paper px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:border-rule-strong hover:text-ink ${newNotificationsPulse ? "notifications-bell-pulse" : ""}`}
                >
                  Notifications
                  {unreadNotificationCount > 0 ? (
                    <span className="ml-2 rounded-sm bg-clay px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-paper">
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </span>
                  ) : null}
                </button>

                {notificationsOpen ? (
                  <div
                    className="absolute right-0 z-50 mt-2 w-96 rounded-md border border-rule-strong bg-paper"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2.5">
                      <h3 className="font-display text-sm font-bold tracking-tight text-ink">Notifications</h3>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            void markAllNotificationsAsRead();
                          }}
                          className="rounded-sm border border-rule px-2 py-1 text-xs text-ink-soft transition hover:bg-paper-sunk hover:text-ink"
                        >
                          Mark all read
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotificationsOpen(false)}
                          className="rounded-sm border border-rule px-2 py-1 text-xs text-ink-soft transition hover:bg-paper-sunk hover:text-ink"
                        >
                          Close
                        </button>
                      </div>
                    </div>

                    <div className="p-2">
                      {notificationsLoading ? <p className="px-1 py-2 text-sm text-ink-faint">Loading notifications…</p> : null}
                      {notificationsError ? <p className="px-1 py-2 text-sm text-signal-danger">{notificationsError}</p> : null}

                      {!notificationsLoading && notifications.length === 0 ? (
                        <p className="py-6 text-center text-sm text-ink-faint">No notifications yet.</p>
                      ) : null}

                      <div className="max-h-80 space-y-px overflow-auto">
                        {notifications.map((notification) => (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => {
                              void markNotificationAsRead(notification.id);
                              setNotificationsOpen(false);
                              router.push(`/editor/${notification.document_id}`);
                            }}
                            className={`w-full rounded-sm px-2.5 py-2 text-left transition hover:bg-paper-sunk ${notification.read_at ? "" : "bg-clay-wash"}`}
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5">
                                {notification.read_at ? null : <span className="h-1.5 w-1.5 rounded-full bg-clay" />}
                                <span className="eyebrow text-[0.6rem] text-ink-soft">{notification.type === "mention" ? "Mention" : "Comment"}</span>
                              </span>
                              <span className="font-mono text-[10px] text-ink-ghost">{formatNotificationTime(notification.created_at)}</span>
                            </div>
                            <p className="text-sm text-ink-soft">{notification.message}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2 rounded-sm border border-rule bg-paper px-2 py-1">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name ? `${user.name} avatar` : "User avatar"}
                    className="h-6 w-6 rounded-sm object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-ink text-xs font-semibold text-paper">
                    {user?.name?.trim()?.charAt(0).toUpperCase() ?? "U"}
                  </div>
                )}
                <p className="hidden text-sm font-medium text-ink sm:block">{user?.name || user?.email || "User"}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-sm border border-rule bg-paper px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:border-rule-strong hover:text-ink disabled:opacity-60"
              >
                {loggingOut ? "Logging out…" : "Logout"}
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-8 md:px-10 md:py-12">{children}</main>
        </div>
      </div>
    </div>
  );
}
