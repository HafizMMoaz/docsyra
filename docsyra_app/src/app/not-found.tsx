import Link from "next/link";

export const runtime = "edge";

export default function NotFound() {
  return (
    <>
      <title>404 — This page could not be found</title>
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <section className="reveal w-full max-w-xl">
          <p className="eyebrow">Errata · Page not found</p>
          <div className="mt-5 flex items-end gap-5 border-b-2 border-ink pb-5">
            <span className="font-display text-[7rem] font-semibold leading-none tracking-tighter text-clay">
              404
            </span>
            <span className="font-display mb-2 text-2xl italic text-ink-faint">
              missing leaf
            </span>
          </div>
          <h1 className="font-display mt-6 text-3xl font-semibold tracking-tight text-ink">
            This page could not be found.
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-ink-soft">
            The document you were looking for may have been moved, unshared, or never set to
            paper. Let&apos;s return you to familiar ground.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-sm bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-clay"
            >
              Back to dashboard
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-sm border border-rule-strong bg-paper-card px-5 py-3 text-sm font-medium text-ink transition hover:border-ink"
            >
              Home
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
