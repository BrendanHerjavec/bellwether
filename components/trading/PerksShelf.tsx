"use client";

import { PERKS } from "@/lib/markets";
import { useTrading } from "./TradingProvider";

/**
 * What credits are for.
 *
 * Without this the whole thing looks like gambling with fake money. The perks
 * are what make a credit worth protecting, which is what makes someone think
 * for a second before backing a hunch they do not really have.
 */
export function PerksShelf() {
  const { balance } = useTrading();

  return (
    <section className="card p-4">
      <h2 className="rule-label">What credits buy</h2>
      <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Credits are not money and cannot be cashed out or converted into it.
        What they buy is bragging rights, and a say in something small.
      </p>

      <ul className="mt-3 space-y-1.5">
        {PERKS.map((perk) => {
          const affordable = balance >= perk.price;
          return (
            <li
              key={perk.id}
              className="flex items-start gap-2.5 rounded-lg px-2 py-2"
              style={{
                background: affordable ? "var(--amber-soft)" : "transparent",
                opacity: affordable ? 1 : 0.62,
              }}
            >
              <span className="text-[15px] leading-none pt-0.5">{perk.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12.5px] font-medium" style={{ color: "var(--ink)" }}>
                    {perk.name}
                  </span>
                  <span
                    className="stat-value shrink-0 text-[12px]"
                    style={{ color: affordable ? "var(--amber)" : "var(--ink-faint)" }}
                  >
                    {perk.price.toLocaleString("en-US")}
                  </span>
                </div>
                <p className="text-[11px] leading-snug" style={{ color: "var(--ink-faint)" }}>
                  {perk.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
