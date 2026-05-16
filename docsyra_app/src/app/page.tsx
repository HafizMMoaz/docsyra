import Link from "next/link";

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

const stats = [
  { label: "Real-time", value: "Yjs + awareness" },
  { label: "Comments", value: "Threads + anchors" },
  { label: "Sync", value: "GitHub connected" },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <span className="font-display text-xl font-bold tracking-tight text-ink">
            Docsyra
          </span>
          <Link
            href="/login"
            className="rounded-sm border border-rule-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-paper-sunk"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* Hero */}
        <section className="border-b border-rule py-20 sm:py-28">
          <p className="reveal eyebrow">
            Collaborative documents
          </p>
          <h1
            className="reveal font-display mt-6 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl"
            style={{ animationDelay: "60ms" }}
          >
            A focused workspace for writing, collaborating, and shipping documents.
          </h1>
          <p
            className="reveal mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft"
            style={{ animationDelay: "120ms" }}
          >
            Docsyra brings a clean editor, live collaboration, threaded comments,
            notifications, sharing, and GitHub sync into one fast, quiet surface.
          </p>
          <div
            className="reveal mt-9 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-sm bg-ink px-6 py-3 text-base font-medium text-paper transition hover:bg-ink-soft"
            >
              Open Docsyra
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-sm border border-rule-strong bg-paper px-6 py-3 text-base font-medium text-ink transition hover:bg-paper-sunk"
            >
              View dashboard
            </Link>
          </div>
        </section>

        {/* Stats strip */}
        <section className="reveal grid border-b border-rule sm:grid-cols-3">
          {stats.map((item, index) => (
            <div
              key={item.label}
              className={`py-8 sm:px-8 ${
                index === 0 ? "sm:pl-0" : "sm:border-l sm:border-rule"
              }`}
            >
              <p className="eyebrow">{item.label}</p>
              <p className="font-display mt-2 text-xl font-bold tracking-tight text-ink">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        {/* Feature grid */}
        <section className="py-20">
          <p className="reveal eyebrow">Capabilities</p>
          <h2 className="reveal font-display mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Everything a document team needs
          </h2>
          <div className="reveal mt-12 grid border-t border-rule sm:grid-cols-2">
            {features.map((item, index) => (
              <article
                key={item.title}
                className={`flex gap-5 border-b border-rule py-8 sm:py-10 ${
                  index % 2 === 1 ? "sm:border-l sm:border-rule sm:pl-10" : "sm:pr-10"
                }`}
              >
                <span className="font-display select-none text-sm font-bold leading-none text-clay">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold tracking-tight text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {item.text}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="reveal mb-20 flex flex-wrap items-center justify-between gap-6 rounded-md border border-rule px-8 py-10">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
              Ready to start writing?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Sign in and open your first collaborative document.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-sm bg-ink px-6 py-3 text-base font-medium text-paper transition hover:bg-ink-soft"
          >
            Open Docsyra
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-rule">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-5 py-8 sm:px-8">
          <span className="font-display text-sm font-bold tracking-tight text-ink">
            Docsyra
          </span>
          <p className="eyebrow">The collaborative document workspace</p>
        </div>
      </footer>
    </div>
  );
}
