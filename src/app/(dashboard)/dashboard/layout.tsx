"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth/session-client";
import type { User } from "@/types";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loadingSession, setLoadingSession] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

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
      });
    } finally {
      router.replace("/login");
      router.refresh();
      setLoggingOut(false);
    }
  }

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6 text-sm text-slate-500 md:px-6">
        Checking session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-5 md:block">
          <div className="text-xl font-semibold tracking-tight">Docsyra</div>

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
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
            <input
              type="text"
              placeholder="Search documents"
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name ? `${user.name} avatar` : "User avatar"}
                    className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
                    {user?.name?.trim()?.charAt(0).toUpperCase() ?? "U"}
                  </div>
                )}
                <p className="hidden text-sm font-medium text-slate-700 sm:block">{user?.name || user?.email || "User"}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
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
