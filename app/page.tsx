import Link from "next/link";

/**
 * The way in. A name and a room code, by design — no accounts, no passwords.
 *
 * Tone note: this is an office game, not an audit. The honest-signal benefit is
 * real and worth mentioning, but it belongs a paragraph down and phrased as a
 * bonus for whoever runs the meeting — never as an accusation aimed at them.
 */
export default function Home() {
  return (
    <div className="paper flex-1">
      <header className="border-b" style={{ borderColor: "var(--rule)" }}>
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
          <span
            className="font-[family-name:var(--font-flap)] text-[20px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "var(--ink)" }}
          >
            Bellwether
          </span>
          <span className="rule-label">Internal · Northwind</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 pb-20 pt-14">
        <p className="rule-label mb-4">The all hands prediction game</p>

        <h1
          className="max-w-3xl text-[44px] font-semibold leading-[1.08] tracking-[-0.02em]"
          style={{ color: "var(--ink)" }}
        >
          Call it before they announce it.
        </h1>

        <p
          className="mt-5 max-w-2xl text-[16px] leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          Everyone gets 1,000 credits and eight questions about Thursday&rsquo;s
          all hands. Back the ones you have a feeling about, watch the odds swing
          on the big screen as people change their minds, and find out afterwards
          who actually saw it coming.
        </p>

        <p
          className="mt-4 max-w-2xl text-[15px] leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          Credits buy the good stuff — the team lunch, the all hands playlist,
          first slot at demo day. And since a call costs you something here, the
          board ends up being a genuinely useful read on what the room expects.
          Rather better than a show of hands.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/play"
            className="rounded-lg px-5 py-2.5 text-[13.5px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--ink)", color: "var(--paper-raised)" }}
          >
            Join the Q3 all hands
          </Link>
          <Link
            href="/board"
            className="rounded-lg border px-5 py-2.5 text-[13.5px] font-semibold transition-colors"
            style={{ borderColor: "var(--rule-strong)", color: "var(--ink-soft)" }}
          >
            See the room display
          </Link>
          <Link
            href="/lab"
            className="px-2 py-2.5 text-[12.5px] transition-opacity hover:opacity-70"
            style={{ color: "var(--ink-faint)" }}
          >
            Animation lab
          </Link>
        </div>

        {/* The three questions someone always asks in the first minute. */}
        <section className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel
            title="Nobody's job is on the table"
            body="Questions are about company outcomes and what gets said on the call. Never anyone's promotion, departure, or job security. Anything that strays gets blocked before it opens."
          />
          <Panel
            title="No arguing at the finish line"
            body="Every market settles with the exact line from the transcript that decided it, timestamped. If the transcript can't settle it cleanly, it's voided and everyone gets their credits back."
          />
          <Panel
            title="Not money, and never will be"
            body="Credits can't be bought, cashed out, or converted into anything. They buy a say in lunch, the playlist, and the name of the next sprint."
          />
        </section>

        <p className="mt-14 text-[12px]" style={{ color: "var(--ink-faint)" }}>
          Northwind is a fictional company used for this demonstration.
        </p>
      </main>
    </div>
  );
}

function Panel({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-5">
      <h2 className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </h2>
      <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        {body}
      </p>
    </div>
  );
}
