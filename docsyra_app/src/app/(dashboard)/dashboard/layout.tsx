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
    { label: "My Docs", href: "/dashboard" },
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
      <div className="min-h-screen bg-[#f7f6f3] px-4 py-6 text-sm text-slate-500 md:px-6">
        Checking session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f6f3] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 border-r border-black/5 bg-white/80 p-5 backdrop-blur md:block">
          <div className="text-lg font-semibold tracking-tight text-slate-900">Docsyra</div>

          <nav className="mt-8 space-y-1 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={
                  isActive(item.href)
                    ? "block rounded-md bg-slate-100 px-3 py-2 font-medium text-slate-900"
                    : "block rounded-md px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-black/5 bg-white/85 px-4 py-3 backdrop-blur md:px-6">
            <input
              type="text"
              placeholder="Search documents"
              className="w-full max-w-md rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-black/20"
            />
            <div className="flex items-center gap-3">
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
                  className={`relative rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 ${newNotificationsPulse ? "notifications-bell-pulse" : ""}`}
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
                    {notificationsError ? <p className="text-sm text-red-600">{notificationsError}</p> : null}

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
                            router.push(`/editor/${notification.document_id}`);
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

              <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white px-2 py-1.5 shadow-sm">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name ? `${user.name} avatar` : "User avatar"}
                    className="h-8 w-8 rounded-full border border-black/10 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-slate-100 text-xs font-semibold text-slate-700">
                    {user?.name?.trim()?.charAt(0).toUpperCase() ?? "U"}
                  </div>
                )}
                <p className="hidden text-sm font-medium text-slate-700 sm:block">{user?.name || user?.email || "User"}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
