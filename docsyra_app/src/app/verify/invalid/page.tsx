export default function VerifyInvalidPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="reveal w-full max-w-lg rounded-sm border border-rule-strong bg-paper-card p-8 shadow-[0_24px_60px_-32px_rgba(33,28,22,0.4)]">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-clay text-lg font-semibold text-paper">
            !
          </span>
          <p className="eyebrow" style={{ color: "var(--clay)" }}>
            Verification failed
          </p>
        </div>
        <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight text-ink">
          This link is no longer valid.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          The verification link may have expired or already been used. Request a fresh one from
          your account settings and we&apos;ll send another.
        </p>
        <a
          href="/dashboard/settings"
          className="mt-7 inline-flex items-center gap-2 rounded-sm bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-clay"
        >
          Go to settings
          <span aria-hidden>→</span>
        </a>
      </section>
    </main>
  );
}
