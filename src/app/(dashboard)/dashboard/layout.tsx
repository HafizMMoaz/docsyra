import Link from "next/link";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-5 md:block">
          <div className="text-xl font-semibold tracking-tight">Docsyra</div>

          <nav className="mt-8 space-y-1 text-sm">
            <Link
              href="/dashboard"
              className="block rounded-md bg-slate-100 px-3 py-2 font-medium text-slate-900"
            >
              Dashboard
            </Link>
            <Link
              href="#"
              className="block rounded-md px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              My Docs
            </Link>
            <Link
              href="#"
              className="block rounded-md px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Settings
            </Link>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
            <input
              type="text"
              placeholder="Search documents"
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400"
            />
            <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200" aria-label="User avatar" />
          </header>

          <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
