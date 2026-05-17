export default function VerifySuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="reveal w-full max-w-md rounded-md border border-rule bg-paper p-8">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-pine" />
          <p className="eyebrow text-pine">Account verified</p>
        </div>
        <h1 className="font-display mt-4 text-2xl font-bold tracking-tight text-ink">
          Your email is verified.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          Verification complete. Collaboration and public sharing are now
          unlocked across your workspace.
        </p>
        <div className="mt-7 border-t border-rule pt-7">
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-sm bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-ink-soft"
          >
            Open dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
