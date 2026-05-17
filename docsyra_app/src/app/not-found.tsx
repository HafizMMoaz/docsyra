import Link from "next/link";

export const runtime = "edge";

export default function NotFound() {
  return (
    <>
      <title>404 — This page could not be found</title>
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <section className="reveal w-full max-w-md">
          <p className="eyebrow text-clay">Error 404</p>
          <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-ink">
            This page could not be found.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-soft">
            The document you were looking for may have been moved, unshared, or
            never created. Let&apos;s return you to familiar ground.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 border-t border-rule pt-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-sm bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-ink-soft"
            >
              Back to dashboard
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-sm border border-rule-strong bg-paper px-5 py-3 text-sm font-medium text-ink transition hover:bg-paper-sunk"
            >
              Home
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
