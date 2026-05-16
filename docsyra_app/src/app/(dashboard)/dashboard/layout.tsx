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

  const navItems = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "My Docs", href: "/dashboard/mydocs" },
    { label: "Settings", href: "/dashboard/settings" },
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
        <span className="font-display italic">Opening your workspace…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-ink">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-rule bg-paper-raised md:flex md:flex-col">
          <div className="border-b border-rule px-6 py-6">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl font-semibold tracking-tight text-ink">Docsyra</span>
            </div>
            <p className="eyebrow mt-1">Document Workspace</p>
          </div>

          <nav className="flex-1 px-3 py-5">
            <p className="eyebrow px-3 pb-2">Navigation</p>
            <div className="space-y-1">
              {navItems.map((item, index) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={
                      active
                        ? "flex items-center gap-3 rounded-sm bg-ink px-3 py-2.5 text-sm font-medium text-paper"
                        : "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-paper-sunk hover:text-ink"
                    }
                  >
                    <span
                      className={`font-display text-xs ${active ? "text-clay-soft" : "text-ink-ghost"}`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-rule px-6 py-5">
            <p className="font-display text-sm italic text-ink-faint">
              &ldquo;A place for every page.&rdquo;
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-rule bg-paper-raised/95 px-4 py-3 backdrop-blur md:px-7">
            <div className="flex items-center gap-3 md:flex-1">
              <span className="font-display text-lg font-semibold tracking-tight text-ink md:hidden">
                Docsyra
              </span>
              <input
                type="text"
                placeholder="Search documents…"
                className="hidden w-full max-w-sm rounded-sm border border-rule-strong bg-paper-card px-3.5 py-2 text-sm text-ink outline-none transition placeholder:text-ink-ghost focus:border-clay md:block"
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
                  className={`relative rounded-sm border border-rule-strong bg-paper-card px-3.5 py-2 text-sm font-medium text-ink-soft transition hover:border-ink hover:text-ink ${newNotificationsPulse ? "notifications-bell-pulse" : ""}`}
                >
                  Notifications
                  {unreadNotificationCount > 0 ? (
                    <span className="ml-2 rounded-full bg-clay px-1.5 py-0.5 text-[11px] font-semibold text-paper">
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </span>
                  ) : null}
                </button>

                {notificationsOpen ? (
                  <div
                    className="absolute right-0 z-50 mt-2 w-96 rounded-sm border border-rule-strong bg-paper-card p-3 shadow-[0_28px_64px_-24px_rgba(33,28,22,0.45)]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-rule pb-2">
                      <h3 className="font-display text-base font-semibold text-ink">Notifications</h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void markAllNotificationsAsRead();
                          }}
                          className="rounded-sm border border-rule-strong px-2 py-1 text-xs text-ink-soft transition hover:bg-paper-sunk"
                        >
                          Mark all read
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotificationsOpen(false)}
                          className="rounded-sm border border-rule-strong px-2 py-1 text-xs text-ink-soft transition hover:bg-paper-sunk"
                        >
                          Close
                        </button>
                      </div>
                    </div>

                    {notificationsLoading ? <p className="text-sm text-ink-faint">Loading notifications…</p> : null}
                    {notificationsError ? <p className="text-sm text-signal-danger">{notificationsError}</p> : null}

                    {!notificationsLoading && notifications.length === 0 ? (
                      <p className="py-4 text-center font-display text-sm italic text-ink-faint">No notifications yet.</p>
                    ) : null}

                    <div className="max-h-80 space-y-2 overflow-auto pr-1">
                      {notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => {
                            void markNotificationAsRead(notification.id);
                            setNotificationsOpen(false);
                            router.push(`/editor/${notification.document_id}`);
                          }}
                          className={`w-full rounded-sm border px-2.5 py-2 text-left transition hover:border-ink ${notification.read_at ? "border-rule bg-paper-card" : "border-clay/40 bg-clay-wash/50"}`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="eyebrow text-[0.6rem] text-clay">{notification.type === "mention" ? "Mention" : "Comment"}</p>
                            <p className="text-[11px] text-ink-faint">{formatNotificationTime(notification.created_at)}</p>
                          </div>
                          <p className="text-sm text-ink-soft">{notification.message}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2 rounded-sm border border-rule-strong bg-paper-card px-2 py-1.5">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name ? `${user.name} avatar` : "User avatar"}
                    className="h-7 w-7 rounded-sm object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-ink text-xs font-semibold text-paper">
                    {user?.name?.trim()?.charAt(0).toUpperCase() ?? "U"}
                  </div>
                )}
                <p className="hidden text-sm font-medium text-ink sm:block">{user?.name || user?.email || "User"}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-sm border border-rule-strong bg-paper-card px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-ink hover:text-ink disabled:opacity-60"
              >
                {loggingOut ? "Logging out…" : "Logout"}
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-8 md:px-10 md:py-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
