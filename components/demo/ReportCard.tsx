"use client";

/**
 * The end of the session, for you specifically.
 *
 * The leaderboard answers "who was best"; this answers "how did I do", which is
 * the question anyone actually has. Every call, what it cost, what it returned,
 * split three ways — the ones you called, the ones you got wrong, and the one
 * that was refunded — and then the balance those add up to, and the shelf of
 * things it will buy.
 *
 * The perks are not a postscript. A number that buys nothing is a score, and a
 * score makes this a game about being clever. The whole reason the mechanism
 * works is that a credit costs something to spend, which is only true if there
 * is something worth spending it on.
 */

import { PERKS } from "@/lib/markets";
import { useTrading } from "@/components/trading/TradingProvider";

export function ReportCard({ highlightPerks }: { highlightPerks: boolean }) {
  const { yourSettlements, markets, balance, startingBalance, standings, purchases, buyPerk } =
    useTrading();

  const byId = new Map(markets.map((m) => [m.id, m]));
  const me = standings.find((row) => row.isYou);

  const won = yourSettlements.filter((s) => s.outcome !== "VOID" && s.profit > 0);
  const lost = yourSettlements.filter((s) => s.outcome !== "VOID" && s.profit <= 0);
  const refunded = yourSettlements.filter((s) => s.outcome === "VOID");

  const staked = yourSettlements.reduce((sum, s) => sum + s.staked, 0);
  const returned = yourSettlements.reduce((sum, s) => sum + s.paid, 0);
  const net = Math.round(balance - startingBalance);

  const label = (id: string) => byId.get(id)?.boardLabel ?? id;

  return (
    <section className="report">
      <div className="report__head">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8a7350]">
          Your session
        </h2>
        <div className="mt-2 flex items-end gap-3">
          <span
            className="report__net"
            style={{ color: net > 0 ? "#7fe0a0" : net < 0 ? "#ff8a6a" : "#e8e4da" }}
          >
            {net > 0 ? "+" : ""}
            {net.toLocaleString("en-US")}
          </span>
          <span className="pb-1.5 text-[12px] leading-snug text-[#6a7183]">
            credits, from 1,000
            {me && (
              <>
                <br />
                {ordinal(me.rank)} of {standings.length} · {me.callsRight} of {me.callsMade} calls
                right
              </>
            )}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Cell label="Staked" value={staked} />
        <Cell label="Returned" value={returned} />
        <Cell label="Balance" value={balance} accent />
      </div>

      <Group title="Called it" tone="#7fe0a0" rows={won} label={label} />
      <Group title="Got it wrong" tone="#ff8a6a" rows={lost} label={label} />
      <Group title="Refunded — too vague to settle" tone="#9aa8bd" rows={refunded} label={label} />

      {/* ------------------------------------------------------ the shelf */}
      <div className="mt-4 border-t border-white/[0.08] pt-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8a7350]">
          What that buys
        </h3>
        <p className="mt-1 text-[11.5px] leading-snug text-[#6a7183]">
          Credits are not money. They cannot be bought, cashed out, or converted
          into anything — they buy a say in something small.
        </p>

        <ul className={`mt-2.5 space-y-1.5${highlightPerks ? " perks--live" : ""}`}>
          {PERKS.map((perk) => {
            const owned = purchases.includes(perk.id);
            const affordable = !owned && balance >= perk.price;
            return (
              <li key={perk.id} className="perk" data-affordable={affordable} data-owned={owned}>
                <span className="perk__icon">{perk.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-medium text-[#e8e4da]">
                      {perk.name}
                    </span>
                    <span
                      className="shrink-0 font-mono text-[11.5px] tabular-nums"
                      style={{ color: affordable ? "#e0a94a" : "#4d5464" }}
                    >
                      {perk.price.toLocaleString("en-US")}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-[#6a7183]">{perk.description}</p>
                </div>
                {owned ? (
                  <span className="perk__owned">Yours</span>
                ) : (
                  <button
                    type="button"
                    className="perk__buy"
                    disabled={!affordable}
                    onClick={() => buyPerk(perk.id)}
                  >
                    {affordable ? "Spend" : `Need ${Math.ceil(perk.price - balance)}`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Group({
  title,
  tone,
  rows,
  label,
}: {
  title: string;
  tone: string;
  rows: { marketId: string; staked: number; paid: number; profit: number; outcome: string }[];
  label: (id: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3.5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.16em]" style={{ color: tone }}>
        {title}
      </div>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.marketId} className="report__row">
            <span className="min-w-0 truncate text-[#c4c0b6]">{label(row.marketId)}</span>
            <span className="shrink-0 font-mono text-[10.5px] text-[#4d5464]">
              {Math.round(row.staked)} → {Math.round(row.paid)}
            </span>
            <span className="shrink-0 font-mono text-[12.5px] tabular-nums" style={{ color: tone }}>
              {row.profit > 0 ? "+" : ""}
              {Math.round(row.profit)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cell({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-black/30 py-2">
      <div
        className="font-[family-name:var(--font-flap)] text-[17px] tabular-nums"
        style={{ color: accent ? "#e0a94a" : "#e8e4da" }}
      >
        {Math.round(value).toLocaleString("en-US")}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6a7183]">{label}</div>
    </div>
  );
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st"
    : n % 10 === 2 && n % 100 !== 12 ? "nd"
    : n % 10 === 3 && n % 100 !== 13 ? "rd"
    : "th";
  return `${n}${suffix}`;
}
