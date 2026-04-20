import Link from "next/link";
import { FaEnvelope, FaGithub, FaLinkedin, FaDiscord, FaTwitter } from "react-icons/fa";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 lg:h-screen lg:overflow-hidden">
      <main className="flex min-h-screen w-full flex-col lg:h-full">
        <section className="flex flex-1 flex-col lg:flex-row bg-white/80 lg:h-full lg:overflow-hidden">
          <div className="relative flex flex-1 flex-col justify-center p-6 sm:p-10 lg:p-16 xl:p-20 lg:overflow-y-auto">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),transparent_40%),linear-gradient(135deg,rgba(15,23,42,0.04),rgba(255,255,255,0))]" />

            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Docsyra
            </div>

            <div className="mt-8 max-w-3xl space-y-5">
              <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                Collaborative documents, comments, presence, and sync
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl xl:text-7xl">
                  A focused workspace for writing, collaborating, and shipping documents.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg lg:text-xl">
                  Docsyra combines a clean editor, live collaboration, threaded comments, notifications,
                  sharing, and GitHub sync into one fast workspace.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-base font-semibold text-white transition hover:bg-slate-800"
                >
                  Open Docsyra
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-xl border border-black/10 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View dashboard
                </Link>
              </div>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-3 max-w-3xl">
              {[
                { label: "Real-time", value: "Yjs + awareness" },
                { label: "Comments", value: "Threads + anchors" },
                { label: "Sync", value: "GitHub connected" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-2 max-w-4xl border-t border-black/5 pt-10">
              {[
                {
                  title: "Live collaboration",
                  text: "Presence, cursor awareness, and threaded comments.",
                },
                {
                  title: "Project memory",
                  text: "Documents, logs, versions, and notifications stay visible.",
                },
                {
                  title: "Sharing controls",
                  text: "Owners can invite collaborators, manage visibility and access.",
                },
                {
                  title: "GitHub sync",
                  text: "Documents can be linked to repository paths and synced.",
                },
              ].map((item) => (
                <article key={item.title} className="rounded-2xl border border-black/5 bg-white/50 p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="border-t border-black/10 bg-slate-50 p-8 sm:p-12 lg:w-[480px] xl:w-[500px] lg:border-l lg:border-t-0 lg:p-12 flex flex-col justify-center lg:overflow-y-auto">
            <div className="space-y-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">About the author</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Hafiz Muhammad Moaz</h2>
                <p className="mt-4 text-base leading-7 text-slate-600">
                  I am the author of this codebase. Docsyra is my collaborative document workspace built
                  around clarity, speed, and practical product workflow.
                </p>
              </div>

              <div className="grid gap-3">
                {[
                  { label: "Email", value: "hafizmoazkhalid@gmail.com", icon: FaEnvelope },
                  { label: "GitHub", value: "HafizMMoaz", href: "https://github.com/HafizMMoaz", icon: FaGithub },
                  { label: "LinkedIn", value: "hafizmmoaz", href: "https://www.linkedin.com/in/hafizmmoaz", icon: FaLinkedin },
                  { label: "Discord", value: "hafizmmoaz", icon: FaDiscord },
                  { label: "Twitter / X", value: "hafizmmoaz", href: "https://x.com/hafizmmoaz", icon: FaTwitter },
                ].map((item) => (
                  <div key={item.label} className="flex items-center rounded-2xl border border-black/10 bg-white p-4 shadow-sm transition-all hover:shadow-md">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 mr-4">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                      {item.href ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block text-sm font-semibold text-slate-900 transition hover:text-sky-700"
                        >
                          {item.value}
                        </a>
                      ) : (
                        <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">What it includes</p>
                <ul className="mt-5 space-y-3 text-sm text-slate-200">
                  <li className="flex items-center before:content-[''] before:w-1.5 before:h-1.5 before:bg-sky-400 before:mr-3 before:rounded-full">Rich text editor with comments and presence</li>
                  <li className="flex items-center before:content-[''] before:w-1.5 before:h-1.5 before:bg-sky-400 before:mr-3 before:rounded-full">Notifications, email alerts, and mentions</li>
                  <li className="flex items-center before:content-[''] before:w-1.5 before:h-1.5 before:bg-sky-400 before:mr-3 before:rounded-full">Sharing, roles, and document activity logs</li>
                  <li className="flex items-center before:content-[''] before:w-1.5 before:h-1.5 before:bg-sky-400 before:mr-3 before:rounded-full">GitHub repository linking and sync</li>
                </ul>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
