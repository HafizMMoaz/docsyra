export default function VerifyInvalidPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="reveal w-full max-w-md rounded-md border border-rule bg-paper p-8">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-signal-danger" />
          <p className="eyebrow text-signal-danger">Verification failed</p>
        </div>
        <h1 className="font-display mt-4 text-2xl font-bold tracking-tight text-ink">
          This link is no longer valid.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          The verification link may have expired or already been used. Request a
          fresh one from your account settings and we&apos;ll send another.
        </p>
        <div className="mt-7 border-t border-rule pt-7">
          <a
            href="/dashboard/settings"
            className="inline-flex items-center justify-center rounded-sm bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-ink-soft"
          >
            Go to settings
          </a>
        </div>
      </section>
    </main>
  );
}
