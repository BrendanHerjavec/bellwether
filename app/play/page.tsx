"use client";

/**
 * The trader's view.
 *
 * What an employee opens at their desk before the all hands. Its whole job is
 * to make an unfamiliar idea — that you should put something you value behind
 * what you actually believe — feel obvious and low stakes within ten seconds.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Ticker } from "@/components/board/Ticker";
import { MarketCard } from "@/components/trading/MarketCard";
import { PerksShelf } from "@/components/trading/PerksShelf";
import { TradingProvider, useTrading } from "@/components/trading/TradingProvider";
import { liquidationValue } from "@/lib/lmsr";
import type { Market } from "@/lib/markets";

export default function PlayPage() {
  return (
    <TradingProvider>
      <TraderView />
    </TradingProvider>
  );
}

function TraderView() {
  const { markets } = useTrading();

  const meeting = markets.filter((m) => m.kind === "meeting");
  const outcome = markets.filter((m) => m.kind === "outcome");

  return (
    <div className="paper flex-1">
      <TopBar />
      <ValueProp />

      <div className="mx-auto grid max-w-[1360px] grid-cols-1 gap-7 px-6 pb-16 lg:grid-cols-[1fr_310px]">
        <main className="min-w-0">
          <SectionHeading
            title="Settles at the meeting"
            detail="These resolve within minutes of the meeting ending, each one with the line from the transcript that decided it."
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {meeting.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>

          <div className="mt-9">
            <SectionHeading
              title="Settles later"
              detail="Opens today, settles in weeks or months. For people who like being right eventually."
            />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {outcome.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          </div>
        </main>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <YourBook />
          <PerksShelf />
          <ActivityFeed />
          <HouseRules />
        </aside>
      </div>

      {/* The tape, pinned to the bottom. Same one that runs on the big screen,
          so the room and the laptop are visibly watching the same floor. */}
      <div
        className="sticky bottom-0 z-20 border-t px-6 py-2"
        style={{ borderColor: "var(--rule)", background: "rgba(245,239,228,0.9)" }}
      >
        <div className="mx-auto max-w-[1360px]">
          <Ticker variant="light" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ chrome */

function TopBar() {
  const { balance, startingBalance, reset } = useTrading();
  const delta = Math.round((balance - startingBalance) * 100) / 100;

  return (
    <header
      className="sticky top-0 z-20 border-b backdrop-blur"
      style={{ borderColor: "var(--rule)", background: "rgba(245,239,228,0.86)" }}
    >
      <div className="mx-auto flex max-w-[1360px] items-center gap-4 px-6 py-3">
        <Link
          href="/"
          className="font-[family-name:var(--font-flap)] text-[19px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "var(--ink)" }}
        >
          Bellwether
        </Link>
        <span className="hidden text-[12px] sm:inline" style={{ color: "var(--ink-faint)" }}>
          Northwind · Q3 All Hands
        </span>

        <Countdown />

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rule-label rounded border px-2 py-1 transition-colors hover:opacity-70"
            style={{ borderColor: "var(--rule)" }}
          >
            Reset
          </button>
          <Link
            href="/board"
            className="rule-label rounded border px-2 py-1 transition-colors hover:opacity-70"
            style={{ borderColor: "var(--rule)" }}
          >
            Big screen
          </Link>
          <div className="balance-pill">
            <span className="stat-value text-[21px] leading-none">
              {balance.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] opacity-70">
              credits
            </span>
            {delta !== 0 && (
              <span
                className="text-[11px] tabular-nums"
                style={{ color: delta > 0 ? "#7fd6a2" : "#e8917f" }}
              >
                {delta > 0 ? "+" : ""}
                {delta.toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/** Client-only so the server and the client never disagree about the time. */
function Countdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = Date.now() + 1000 * 60 * 107; // 1h 47m out
    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (remaining === null) return null;

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 md:inline-flex"
      style={{ background: "var(--amber-soft)", color: "var(--amber)" }}
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      <span className="text-[11.5px] font-medium tabular-nums">
        Doors close in {hours}h {String(minutes).padStart(2, "0")}m{" "}
        {String(seconds).padStart(2, "0")}s
      </span>
    </span>
  );
}

function ValueProp() {
  return (
    <div className="mx-auto max-w-[1360px] px-6 pb-6 pt-8">
      <div className="max-w-3xl">
        <h1
          className="text-[32px] font-semibold leading-[1.14] tracking-[-0.015em]"
          style={{ color: "var(--ink)" }}
        >
          You&rsquo;ve got 1,000 credits and a hunch.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Eight questions about Thursday&rsquo;s all hands. Back whichever ones
          you have a feeling about — every credit you put down nudges the odds on
          the big screen, and when the meeting wraps, the transcript settles it.
          Being right pays. Being loud doesn&rsquo;t.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Step
          n="1"
          title="Back a side"
          body="Pick YES or NO on anything open. Your stake sets what you collect if you called it right."
        />
        <Step
          n="2"
          title="Watch it move"
          body="Every credit moves the price. The board in the room updates live as people change their minds."
        />
        <Step
          n="3"
          title="See who called it"
          body="The transcript settles each market with the exact line that decided it. Anything too vague to call is voided and refunded."
        />
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="card flex gap-3 p-4">
      <span
        className="stat-value flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px]"
        style={{ background: "var(--ink)", color: "var(--paper-raised)" }}
      >
        {n}
      </span>
      <div>
        <div className="text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
          {title}
        </div>
        <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--ink-soft)" }}>
          {body}
        </p>
      </div>
    </div>
  );
}

function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </h2>
      <p className="mt-0.5 max-w-2xl text-[12.5px] leading-snug" style={{ color: "var(--ink-faint)" }}>
        {detail}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- sidebar */

function YourBook() {
  const { positions, markets, balance, startingBalance } = useTrading();

  const held = useMemo(() => {
    const byId = new Map<string, Market>(markets.map((m) => [m.id, m]));
    return Object.values(positions)
      .filter((p) => p.yesShares > 0 || p.noShares > 0)
      .map((p) => {
        const market = byId.get(p.marketId)!;
        // Valued as an unwind, not as shares times price. A fresh position is
        // therefore worth what was paid for it rather than showing an instant
        // paper profit from the trader's own price impact.
        const value = liquidationValue(market.state, p.yesShares, p.noShares);
        return { position: p, market, value, pnl: value - p.creditsStaked };
      });
  }, [positions, markets]);

  const staked = held.reduce((sum, h) => sum + h.position.creditsStaked, 0);
  const value = held.reduce((sum, h) => sum + h.value, 0);
  const net = balance + value - startingBalance;

  return (
    <section className="card p-4">
      <h2 className="rule-label">Your calls</h2>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Cash" value={Math.round(balance)} />
        <Stat label="At risk" value={Math.round(staked)} />
        <Stat
          label="Net"
          value={Math.round(net)}
          tone={net > 0 ? "yes" : net < 0 ? "no" : undefined}
          signed
        />
      </div>

      {held.length === 0 ? (
        <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--ink-faint)" }}>
          Nothing backed yet. Start with whichever one you already have an
          opinion about — that is usually where the easy credits are.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {held.map(({ position, market, pnl }) => (
            <li key={market.id} className="text-[12px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate" style={{ color: "var(--ink-soft)" }}>
                  {market.boardLabel}
                </span>
                <span
                  className="stat-value shrink-0 tabular-nums"
                  style={{ color: pnl >= 0 ? "var(--yes)" : "var(--no)" }}
                >
                  {pnl >= 0 ? "+" : ""}
                  {pnl.toFixed(0)}
                </span>
              </div>
              <div className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                {position.yesShares > 0 ? `${Math.round(position.yesShares)} YES` : ""}
                {position.yesShares > 0 && position.noShares > 0 ? " · " : ""}
                {position.noShares > 0 ? `${Math.round(position.noShares)} NO` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  signed,
}: {
  label: string;
  value: number;
  tone?: "yes" | "no";
  signed?: boolean;
}) {
  const color = tone === "yes" ? "var(--yes)" : tone === "no" ? "var(--no)" : "var(--ink)";
  return (
    <div className="rounded-lg py-2" style={{ background: "var(--paper-sunk)" }}>
      <div className="stat-value text-[17px]" style={{ color }}>
        {signed && value > 0 ? "+" : ""}
        {value.toLocaleString("en-US")}
      </div>
      <div className="rule-label mt-0.5">{label}</div>
    </div>
  );
}

function ActivityFeed() {
  const { trades, markets } = useTrading();
  const byId = new Map(markets.map((m) => [m.id, m]));

  return (
    <section className="card p-4">
      <h2 className="rule-label">On the floor</h2>
      <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
        Everyone trades anonymously. Leadership is the exception — they show
        their name, so you can see what they are backing.
      </p>
      <ul className="mt-3 space-y-2">
        {trades.slice(0, 6).map((trade) => {
          const market = byId.get(trade.marketId);
          return (
            <li key={trade.id} className="text-[11.5px] leading-snug">
              <span
                className="font-medium"
                style={{ color: trade.isPublic ? "var(--amber)" : "var(--ink-soft)" }}
              >
                {trade.displayName}
              </span>{" "}
              <span style={{ color: "var(--ink-faint)" }}>backed</span>{" "}
              <span
                className="font-semibold"
                style={{ color: trade.side === "YES" ? "var(--yes)" : "var(--no)" }}
              >
                {trade.side}
              </span>{" "}
              <span style={{ color: "var(--ink-faint)" }}>on {market?.boardLabel}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HouseRules() {
  return (
    <section className="card p-4">
      <h2 className="rule-label">House rules</h2>
      <ul className="mt-2 space-y-2 text-[11.5px] leading-snug" style={{ color: "var(--ink-soft)" }}>
        <li>
          <strong style={{ color: "var(--ink)" }}>Nobody&rsquo;s job is on the table.</strong>{" "}
          Questions cover company outcomes and what gets said on the call. Never
          anyone&rsquo;s promotion, departure, or job security.
        </li>
        <li>
          <strong style={{ color: "var(--ink)" }}>Presenters sit out their own slides.</strong>{" "}
          If you are the one announcing it, you do not get to back it.
        </li>
        <li>
          <strong style={{ color: "var(--ink)" }}>Too vague to call? Everyone gets refunded.</strong>{" "}
          If the transcript cannot settle it cleanly, the market is voided and
          your credits come straight back.
        </li>
        <li>
          <strong style={{ color: "var(--ink)" }}>Credits are not money.</strong> They
          cannot be bought, cashed out, or converted into anything. They buy
          perks and bragging rights.
        </li>
      </ul>
    </section>
  );
}
