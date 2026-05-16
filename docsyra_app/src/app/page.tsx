import Link from "next/link";
import { FaEnvelope, FaGithub, FaLinkedin, FaDiscord, FaTwitter } from "react-icons/fa";

const ledger = [
  { no: "01", label: "Real-time", value: "Yjs + awareness" },
  { no: "02", label: "Comments", value: "Threads + anchors" },
  { no: "03", label: "Sync", value: "GitHub connected" },
];

const features = [
  {
    title: "Live collaboration",
    text: "Presence, cursor awareness, and threaded comments — see everyone on the page.",
  },
  {
    title: "Project memory",
    text: "Documents, activity logs, versions, and notifications stay close at hand.",
  },
  {
    title: "Sharing controls",
    text: "Owners invite collaborators, set roles, and govern visibility per document.",
  },
  {
    title: "GitHub sync",
    text: "Link documents to repository paths and keep prose and code in step.",
  },
];

const contacts = [
  { label: "Email", value: "hafizmoazkhalid@gmail.com", icon: FaEnvelope, href: undefined as string | undefined },
  { label: "GitHub", value: "HafizMMoaz", href: "https://github.com/HafizMMoaz", icon: FaGithub },
  { label: "LinkedIn", value: "hafizmmoaz", href: "https://www.linkedin.com/in/hafizmmoaz", icon: FaLinkedin },
  { label: "Discord", value: "hafizmmoaz", icon: FaDiscord, href: undefined as string | undefined },
  { label: "Twitter / X", value: "hafizmmoaz", href: "https://x.com/hafizmmoaz", icon: FaTwitter },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-[1320px] px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
        {/* Masthead */}
        <header className="reveal flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-5">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-3xl font-semibold tracking-tight text-ink">Docsyra</span>
            <span className="hidden h-4 w-px bg-rule-strong sm:block" />
            <span className="eyebrow hidden sm:block">The Collaborative Document Workspace</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="eyebrow hidden md:block">Vol. 1 — Edition 2026</span>
            <Link
              href="/login"
              className="rounded-sm border border-ink px-4 py-2 font-medium text-ink transition hover:bg-ink hover:text-paper"
            >
              Open Docsyra
            </Link>
          </div>
        </header>

        <div className="grid gap-10 pt-10 lg:grid-cols-[1.62fr_1fr] lg:gap-14">
          {/* Lead column */}
          <section>
            <p className="reveal eyebrow" style={{ animationDelay: "60ms" }}>
              Collaborative documents · comments · presence · sync
            </p>

            <h1
              className="reveal font-display mt-5 text-[2.65rem] font-semibold leading-[1.04] tracking-tight text-ink sm:text-6xl xl:text-[4.6rem]"
              style={{ animationDelay: "120ms" }}
            >
              A focused workspace for{" "}
              <span className="italic text-clay">writing</span>,{" "}
              collaborating, and shipping documents.
            </h1>

            <p
              className="reveal mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft"
              style={{ animationDelay: "200ms" }}
            >
              Docsyra draws a clean editor, live collaboration, threaded comments, notifications,
              sharing, and GitHub sync into one quiet, fast surface — the kind of tool that
              disappears so the work can show.
            </p>

            <div
              className="reveal mt-8 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "280ms" }}
            >
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 rounded-sm bg-ink px-6 py-3.5 text-base font-medium text-paper transition hover:bg-clay"
              >
                Open Docsyra
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-sm border border-rule-strong bg-paper-card px-6 py-3.5 text-base font-medium text-ink transition hover:border-ink"
              >
                View dashboard
              </Link>
            </div>

            {/* Ledger of capabilities */}
            <div
              className="reveal mt-12 grid gap-px overflow-hidden rounded-sm border border-rule-strong bg-rule-strong sm:grid-cols-3"
              style={{ animationDelay: "340ms" }}
            >
              {ledger.map((item) => (
                <div key={item.label} className="bg-paper-card p-5">
                  <div className="flex items-baseline justify-between">
                    <p className="eyebrow">{item.label}</p>
                    <span className="font-display text-sm text-ink-ghost">{item.no}</span>
                  </div>
                  <p className="font-display mt-2 text-xl font-semibold text-ink">{item.value}</p>
                </div>
              ))}
            </div>

            {/* Feature register */}
            <div
              className="reveal mt-12 border-t border-rule pt-8"
              style={{ animationDelay: "400ms" }}
            >
              <p className="eyebrow mb-6">In this edition</p>
              <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {features.map((item, index) => (
                  <article key={item.title} className="flex gap-4">
                    <span className="font-display select-none text-2xl font-semibold leading-none text-clay">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-ink">{item.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{item.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* Colophon column */}
          <aside className="reveal lg:pl-2" style={{ animationDelay: "240ms" }}>
            <div className="lg:sticky lg:top-10">
              <div className="rounded-sm border border-rule-strong bg-paper-raised p-7">
                <p className="eyebrow">The Colophon</p>
                <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-ink">
                  Hafiz Muhammad Moaz
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink-soft">
                  I am the author of this codebase. Docsyra is my collaborative document
                  workspace, built around clarity, speed, and a practical product workflow.
                </p>

                <div className="mt-6 space-y-px overflow-hidden rounded-sm border border-rule bg-rule">
                  {contacts.map((item) => (
                    <div key={item.label} className="flex items-center gap-3 bg-paper-card px-3.5 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-paper-sunk text-ink-soft">
                        <item.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="eyebrow text-[0.6rem]">{item.label}</p>
                        {item.href ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-sm font-medium text-ink transition hover:text-clay"
                          >
                            {item.value}
                          </a>
                        ) : (
                          <p className="truncate text-sm font-medium text-ink">{item.value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-sm bg-ink p-7 text-paper">
                <p className="eyebrow text-clay-soft">What it includes</p>
                <ul className="mt-5 space-y-3 text-sm text-paper-sunk">
                  {[
                    "Rich text editor with comments and presence",
                    "Notifications, email alerts, and mentions",
                    "Sharing, roles, and document activity logs",
                    "GitHub repository linking and sync",
                  ].map((line) => (
                    <li key={line} className="flex gap-3">
                      <span className="font-display mt-0.5 text-clay-soft">—</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>

        <footer className="reveal mt-16 flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink pt-5 text-sm text-ink-faint">
          <p className="font-display italic">&ldquo;Set it down before it slips away.&rdquo;</p>
          <p className="eyebrow">Docsyra — Printed on warm paper</p>
        </footer>
      </main>
    </div>
  );
}
