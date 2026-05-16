export default function VerifySuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="reveal w-full max-w-lg rounded-sm border border-rule-strong bg-paper-card p-8 shadow-[0_24px_60px_-32px_rgba(33,28,22,0.4)]">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pine text-base font-semibold text-paper">
            ✓
          </span>
          <p className="eyebrow" style={{ color: "var(--pine)" }}>
            Account verified
          </p>
        </div>
        <h1 className="font-display mt-5 text-3xl font-semibold tracking-tight text-ink">
          Your email is on the record.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          Verification complete. Collaboration and public sharing are now unlocked across your
          workspace.
        </p>
        <a
          href="/dashboard"
          className="mt-7 inline-flex items-center gap-2 rounded-sm bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-clay"
        >
          Open dashboard
          <span aria-hidden>→</span>
        </a>
      </section>
    </main>
  );
}
