"use client";

/**
 * Step 2: the split-flap board in isolation.
 *
 * No 3D, no backend, no market maker. Just six rows and every knob that affects
 * how a price change feels, exposed so the animation and the sound can be tuned
 * against each other. The acceptance test for this page is simple: watch it
 * muted and you should still know a price moved.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketRow, type MarketRowStatus } from "@/components/board/MarketRow";
import { flapAudio } from "@/components/splitflap/flap-audio";
import { DEFAULT_TIMING } from "@/lib/splitflap";

interface LabMarket {
  question: string;
  openingPrice: number;
  price: number;
  status: MarketRowStatus;
}

/**
 * Northwind is a fictional team project management product. These are the
 * shapes of question the real seed data uses: company outcomes and meeting
 * content, never an individual's job.
 */
const INITIAL_MARKETS: LabMarket[] = [
  // Kept short on purpose. A tote board entry has to read in one glance from
  // across a room, and every character costs a physical drum.
  { question: "PRICING CHANGE NAMED", openingPrice: 0.44, price: 0.44, status: "open" },
  { question: "ARR CLEARS 40M", openingPrice: 0.61, price: 0.61, status: "open" },
  { question: "ENTERPRISE TIER DATED", openingPrice: 0.18, price: 0.18, status: "open" },
  { question: "MOBILE SHIPS IN Q3", openingPrice: 0.23, price: 0.23, status: "open" },
  { question: "Q AND A RUNS LONG", openingPrice: 0.72, price: 0.72, status: "open" },
  { question: "NEW LOGO ON STAGE", openingPrice: 0.35, price: 0.35, status: "open" },
];

const STATUS_CYCLE: MarketRowStatus[] = [
  "open",
  "locked",
  "settled-yes",
  "settled-no",
  "void",
];

export default function LabPage() {
  const [markets, setMarkets] = useState<LabMarket[]>(INITIAL_MARKETS);

  // The board boots blank and flips its questions in. It is the best possible
  // first frame, and it is also the harshest test of the animation: 200 drums
  // moving at once.
  const [booted, setBooted] = useState(false);
  const [bootKey, setBootKey] = useState(0);

  const [soundOn, setSoundOn] = useState(false);
  const [volume, setVolume] = useState(0.35);

  const [flapHeight, setFlapHeight] = useState(52);
  const [textHeight, setTextHeight] = useState(30);
  // Drum aspect ratio. The binding constraint is "%", the widest glyph on the
  // drum; below about 0.70 it overflows its cell and gets its sides shaved.
  const [textAspect, setTextAspect] = useState(0.74);
  const [baseMs, setBaseMs] = useState(DEFAULT_TIMING.baseMs);
  const [decelFlips, setDecelFlips] = useState(DEFAULT_TIMING.decelFlips);
  const [decelMax, setDecelMax] = useState(DEFAULT_TIMING.decelMax);
  const [jitter, setJitter] = useState(DEFAULT_TIMING.jitter);
  const [textStagger, setTextStagger] = useState(24);
  const [priceStagger, setPriceStagger] = useState(55);
  const [textMinFlips, setTextMinFlips] = useState(6);
  const [priceMinFlips, setPriceMinFlips] = useState(9);
  const [soundDensity, setSoundDensity] = useState(0.28);

  const [drifting, setDrifting] = useState(false);

  // Must be memoised: this object is a dependency of every character's
  // animation effect, and a fresh literal each render would thrash them.
  const timing = useMemo(
    () => ({ baseMs, decelFlips, decelMax, jitter }),
    [baseMs, decelFlips, decelMax, jitter],
  );

  useEffect(() => {
    const id = window.setTimeout(() => setBooted(true), 420);
    return () => window.clearTimeout(id);
  }, [bootKey]);

  useEffect(() => {
    flapAudio.setVolume(volume);
  }, [volume]);

  const toggleSound = useCallback(async () => {
    if (soundOn) {
      flapAudio.disable();
      setSoundOn(false);
      return;
    }
    // Browsers only allow an AudioContext to start inside a user gesture.
    const ok = await flapAudio.enable();
    setSoundOn(ok);
    if (ok) flapAudio.click(0.8);
  }, [soundOn]);

  const nudge = useCallback((index: number, points: number) => {
    setMarkets((prev) =>
      prev.map((m, i) => {
        if (i !== index) return m;
        const next = Math.min(0.99, Math.max(0.01, m.price + points / 100));
        return { ...m, price: next };
      }),
    );
  }, []);

  const randomise = useCallback((index: number) => {
    setMarkets((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, price: 0.05 + Math.random() * 0.9 } : m,
      ),
    );
  }, []);

  const cycleStatus = useCallback((index: number) => {
    setMarkets((prev) =>
      prev.map((m, i) => {
        if (i !== index) return m;
        const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(m.status) + 1) % STATUS_CYCLE.length];
        return { ...m, status: next };
      }),
    );
  }, []);

  const shockAll = useCallback(() => {
    setMarkets((prev) =>
      prev.map((m) => ({ ...m, price: 0.05 + Math.random() * 0.9 })),
    );
  }, []);

  const resetAll = useCallback(() => {
    setMarkets(INITIAL_MARKETS.map((m) => ({ ...m })));
  }, []);

  const reboot = useCallback(() => {
    setBooted(false);
    setMarkets(INITIAL_MARKETS.map((m) => ({ ...m })));
    setBootKey((k) => k + 1);
  }, []);

  /** The long-shot beat: 18 to 91 in one move. The biggest cascade available. */
  const longShotComesIn = useCallback(() => {
    setMarkets((prev) =>
      prev.map((m, i) => (i === 2 ? { ...m, price: 0.91 } : m)),
    );
  }, []);

  // Continuous small moves, to hear what the board sounds like under sustained
  // trading rather than one dramatic jump.
  useEffect(() => {
    if (!drifting) return;
    // `timer` always holds the most recently scheduled id, so the cleanup
    // cancels whichever tick is currently pending.
    let timer: number;
    const tick = () => {
      setMarkets((prev) => {
        const index = Math.floor(Math.random() * prev.length);
        return prev.map((m, i) => {
          if (i !== index || m.status !== "open") return m;
          const delta = (Math.random() - 0.5) * 0.16;
          return { ...m, price: Math.min(0.96, Math.max(0.04, m.price + delta)) };
        });
      });
      timer = window.setTimeout(tick, 700 + Math.random() * 1400);
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [drifting]);

  return (
    <div
      className="hall flapboard"
      style={
        {
          "--flap-h": `${flapHeight}px`,
          "--flap-text-h": `${textHeight}px`,
          "--flap-text-w": `${Math.round(textHeight * textAspect)}px`,
        } as React.CSSProperties
      }
    >
      <div className="hall__content mx-auto flex max-w-[1600px] gap-8 px-8 py-10">
        {/* ------------------------------------------------------ the board */}
        <main className="min-w-0 flex-1">
          <div className="board">
            <div className="board__header">
              <div>
                <div className="board__title">Bellwether</div>
                <div className="board__subtitle mt-1">
                  Northwind · Q3 All Hands · Animation lab
                </div>
              </div>
              <div className="board__subtitle text-right">
                Credits are not money
                <br />
                <span className="text-[#5b6272]">Step 2 · board in isolation</span>
              </div>
            </div>

            <div className="board__columns">
              <span className="w-[22px]" />
              <span className="flex-1">Market</span>
              <span className="w-[92px]">Yes</span>
              <span className="w-[62px] text-right">Move</span>
              <span className="w-[116px]">Status</span>
            </div>

            <div className="board__well">
              {markets.map((market, index) => (
                <MarketRow
                  key={index}
                  index={index + 1}
                  question={booted ? market.question : ""}
                  price={market.price}
                  openingPrice={market.openingPrice}
                  status={market.status}
                  timing={timing}
                  textStagger={textStagger}
                  priceStagger={priceStagger}
                  textMinFlips={textMinFlips}
                  priceMinFlips={priceMinFlips}
                  soundDensity={soundDensity}
                  // Rows boot one after another rather than all at once, so the
                  // opening reads as a board waking up row by row.
                  baseDelayMs={booted ? index * 130 : 0}
                />
              ))}
            </div>
          </div>

          {/* Per-row manual control. */}
          <div className="mt-6 rounded-lg border border-white/8 bg-white/[0.02] p-4">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-[#6a7183]">
              Manual price control
            </div>
            <div className="space-y-2">
              {markets.map((market, index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="w-6 font-mono text-[11px] text-[#545b6b]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 truncate font-mono text-[11px] text-[#8b93a5]">
                    {market.question}
                  </span>
                  <span className="w-12 text-right font-mono text-[12px] tabular-nums text-[#e8e4da]">
                    {Math.round(market.price * 100)}%
                  </span>
                  <LabButton onClick={() => nudge(index, -5)}>−5</LabButton>
                  <LabButton onClick={() => nudge(index, -1)}>−1</LabButton>
                  <LabButton onClick={() => nudge(index, 1)}>+1</LabButton>
                  <LabButton onClick={() => nudge(index, 5)}>+5</LabButton>
                  <LabButton onClick={() => randomise(index)}>Jump</LabButton>
                  <LabButton onClick={() => cycleStatus(index)} wide>
                    {market.status}
                  </LabButton>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* ---------------------------------------------------- the controls */}
        <aside className="w-[290px] flex-none space-y-5">
          <Panel title="Board">
            <div className="flex flex-wrap gap-2">
              <LabButton onClick={reboot} wide>
                Reboot board
              </LabButton>
              <LabButton onClick={shockAll} wide>
                Shock all prices
              </LabButton>
              <LabButton onClick={longShotComesIn} wide>
                Long shot comes in
              </LabButton>
              <LabButton onClick={resetAll} wide>
                Reset to opening
              </LabButton>
              <LabButton onClick={() => setDrifting((d) => !d)} wide active={drifting}>
                {drifting ? "Stop drift" : "Start drift"}
              </LabButton>
            </div>
          </Panel>

          <Panel title="Sound">
            <LabButton onClick={toggleSound} wide active={soundOn}>
              {soundOn ? "Sound on" : "Sound off"}
            </LabButton>
            <p className="mt-2 text-[10px] leading-relaxed text-[#5b6272]">
              Synthesised per flip, so no two clicks are identical. Rate limited
              across the whole board so a full cascade stays a texture.
            </p>
            <Slider
              label="Volume"
              value={volume}
              min={0}
              max={1}
              step={0.01}
              onChange={setVolume}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Slider
              label="Click density"
              value={soundDensity}
              min={0}
              max={1}
              step={0.01}
              onChange={setSoundDensity}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </Panel>

          <Panel title="Flip timing">
            <Slider
              label="Flip duration"
              value={baseMs}
              min={24}
              max={140}
              step={1}
              onChange={setBaseMs}
              format={(v) => `${v}ms`}
            />
            <Slider
              label="Decel flips"
              value={decelFlips}
              min={0}
              max={10}
              step={1}
              onChange={setDecelFlips}
              format={(v) => `${v}`}
            />
            <Slider
              label="Final flip stretch"
              value={decelMax}
              min={1}
              max={5}
              step={0.1}
              onChange={setDecelMax}
              format={(v) => `${v.toFixed(1)}×`}
            />
            <Slider
              label="Jitter"
              value={jitter}
              min={0}
              max={0.5}
              step={0.01}
              onChange={setJitter}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </Panel>

          <Panel title="Cascade shape">
            <Slider
              label="Text stagger"
              value={textStagger}
              min={0}
              max={80}
              step={1}
              onChange={setTextStagger}
              format={(v) => `${v}ms`}
            />
            <Slider
              label="Price stagger"
              value={priceStagger}
              min={0}
              max={200}
              step={1}
              onChange={setPriceStagger}
              format={(v) => `${v}ms`}
            />
            <Slider
              label="Text min flips"
              value={textMinFlips}
              min={1}
              max={20}
              step={1}
              onChange={setTextMinFlips}
              format={(v) => `${v}`}
            />
            <Slider
              label="Price min flips"
              value={priceMinFlips}
              min={1}
              max={24}
              step={1}
              onChange={setPriceMinFlips}
              format={(v) => `${v}`}
            />
          </Panel>

          <Panel title="Legibility">
            <Slider
              label="Price drum height"
              value={flapHeight}
              min={26}
              max={92}
              step={1}
              onChange={setFlapHeight}
              format={(v) => `${v}px`}
            />
            <Slider
              label="Question drum height"
              value={textHeight}
              min={16}
              max={56}
              step={1}
              onChange={setTextHeight}
              format={(v) => `${v}px`}
            />
            <Slider
              label="Question drum width"
              value={textAspect}
              min={0.6}
              max={1}
              step={0.01}
              onChange={setTextAspect}
              format={(v) => `${Math.round(textHeight * v)}px`}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-[#5b6272]">
              The number of drums per row is measured from the column, so a
              bigger drum means a shorter question rather than an overflowing
              one. Questions are clipped to what fits.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- lab chrome -- */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/8 bg-white/[0.02] p-4">
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-[#6a7183]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function LabButton({
  children,
  onClick,
  wide,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  wide?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
        wide ? "min-w-[86px] flex-1" : "min-w-[34px]"
      } ${
        active
          ? "border-[#e0a94a]/50 bg-[#e0a94a]/12 text-[#e0a94a]"
          : "border-white/10 bg-white/[0.03] text-[#98a0b2] hover:border-white/25 hover:text-[#e8e4da]"
      }`}
    >
      {children}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
}) {
  return (
    <label className="mt-3 block">
      <span className="flex items-baseline justify-between font-mono text-[10px] text-[#8b93a5]">
        <span>{label}</span>
        <span className="tabular-nums text-[#e8e4da]">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 w-full accent-[#e0a94a]"
      />
    </label>
  );
}
