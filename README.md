# Bellwether

An internal prediction market a company runs around its all hands meetings.

Everyone gets 1,000 play credits and a handful of questions about what will be
announced and what the company will actually achieve. Back your hunches, watch
the odds swing on the big screen, and find out afterwards who called it.

Underneath the game there is a real mechanism: because a call costs you
something, the board is a far better read on what a room expects than a show of
hands. That benefit is worth having, but the product is an office game first —
the tone throughout is playful, and the guidance-versus-the-floor contrast is
framed as a matchup between two views, never as an accusation aimed at anyone.

Play credits only. Never money, never convertible to money.

## Running it

```bash
npm run dev
```

| Route   | What it is                                                            |
| ------- | --------------------------------------------------------------------- |
| `/`     | The argument for why this exists                                      |
| `/play` | **The trader view.** Balance, markets, stakes, positions, perks        |
| `/board`| The room display. Dark, sparse, meant for a projector                  |
| `/lab`  | The split-flap board in isolation, with every animation knob exposed   |

### Two surfaces, on purpose

`/play` is warm and light; `/board` is dark and cinematic. That is not an
inconsistency. The board is a physical object projected on a wall in a dimmed
room, and the brief is specific that it should read as a quiet trading floor at
night. The trader view is a page someone opens at their desk ten minutes before
the meeting, and it has to explain an unfamiliar idea fast. The thread between
them is the odds readout: the same split-flap mechanism, dropped into the light
cards as a small dark inset.

```bash
npm test          # LMSR and split-flap unit tests
npm run build     # production build + typecheck
npm run lint
```

## Where the build is up to

Following the build order in the brief:

- [x] **1. Scaffold, schema, LMSR with unit tests.**
- [x] **2. The split-flap board as a standalone 2D component.**
- [~] 3. Trading. The trader view and the full buy flow are built, but trades
      currently run against a client-side store, not the server. Swapping in
      the server route is one function: `executeTrade()` in `TradingProvider`.
      Needs the Supabase service role key in `.env.local`.
- [x] **4. Bot traders and the ticker tape.**
- [~] 7. The 3D hall. Built and passing geometric tests, but **not yet seen by
      anyone**. See "The hall" below.
- [ ] 5. Transcript upload, AI resolver, void path, settlement, leaderboard
- [ ] 6. Market screening and the insider visibility rule
- [ ] 7. The 3D hall
- [ ] 8. Big screen mode, podium, perks shelf
- [ ] 9. Blender environment

## Layout

```
lib/lmsr.ts             LMSR market maker. Pure, no dependencies.
lib/splitflap.ts        Flip path and timing model. Pure, no DOM.
components/splitflap/   The display: one component per character, plus the click synth.
components/board/       Market rows and the board housing.
supabase/migrations/    Schema, the LMSR in SQL, and the trade transaction.
app/lab/                Step 2's tuning page.
```

## The bot floor

Four personas from the brief — optimist, cynic, contrarian, well-informed —
trading on randomised schedules against the same book you trade against. They
are what keep the tape moving and the flaps firing during a solo recording.

Two things about them are load-bearing and easy to get wrong:

**They hold views, they do not chase momentum.** The optimist and the cynic
anchor to where a market *opened*, not to where it is now. Anchored to the live
price, every purchase raises the price, which raises the target, which justifies
another purchase — four bots reasoning that way walk every market to an extreme
and the board drifts one direction all session.

**Views are measured in log-odds, not percentage points.** Percentage points are
not symmetric near the ends: a bearish view on a market trading at 18% gets
clamped by the floor at 0 while an equivalent bullish view is not. Since stake
size scales with perceived edge, the optimist quietly outspent the cynic about
two to one on every cheap market. Most markets open below even money, so the
whole board tilted up. `lib/bots.test.ts` guards both with a session simulation.

## The hall

`/board` renders the board inside a 3D exchange hall, with a flat fallback on a
toggle. The fallback is not a nicety — the hall is the only part of this app
that can be too slow on a given laptop, and a projected board that stutters is
worse than one that is merely flat.

**The screen cannot be occluded, so nothing is allowed in front of it.**

The board is DOM composited outside the WebGL canvas, which means 3D geometry
physically cannot occlude it: a figure standing between the camera and the
screen renders *behind* it, and the screen appears to float in front of their
face. drei's `occlude` does not rescue this — the raycast modes hide the whole
element, so one passer-by would blank the entire board, and `blending` needs a
transparent canvas that fights the EffectComposer.

The fix is projective rather than technical, and it is why the room is an
auditorium. Anything below the camera's eye height projects below the horizon
line; anything above it projects above. So if **every head is lower than the
camera and the screen's bottom edge is higher**, they can never overlap — at any
distance, at any focal length. Seating the audience buys that invariant outright.
`lib/hall.test.ts` asserts both halves with margin; break either and the
floating screen comes back.

The screen is also set into a real opening cut through the back wall, with
reveals lining its sides, rather than hung in front of a flat plane. The shadow
down the reveal is what tells the eye it is part of the building.

**Two things about the Canvas boundary that cost real time.**

1. *React context does not cross it.* R3F runs its own reconciler and drei's
   `<Html>` portals children into a detached DOM subtree. A board that read
   `useTrading()` threw "must be used inside a TradingProvider" and took the
   whole scene down. Re-providing the context inside the Canvas did not fix it
   either. So `TotBoardView` and `TickerView` take every piece of state as
   props and touch no context at all; the context-reading wrappers exist only
   for ordinary page use. `components/board/TotBoard.test.tsx` renders both
   with no provider mounted, which is exactly the condition inside the Canvas.
2. *drei's `scale` is not metres per pixel.* `<Html transform>` maps 400 CSS
   pixels onto 10 world units at `scale={1}`. Passing metres-per-pixel straight
   through rendered a 21.75m board 16 CSS pixels wide. `boardHtmlScale` does
   the conversion and a test pins it.

**The board is not part of the WebGL render.** drei's `<Html transform>` puts it
in a DOM layer positioned by the camera matrix but composited outside the
canvas. That is the whole point of the brief specifying CSS3DRenderer: the
digits stay real text at projector resolution instead of becoming a blurry
texture. The cost is that post-processing cannot touch the board — no bloom on
the glyphs, no depth of field, and no WebGL geometry can occlude it. The board's
glow is done in CSS instead, tuned to sit alongside the bloom rather than come
from it. Rendering it to a texture would fix that and give up the crispness the
approach exists to protect. Don't.

**Every dimension lives in `lib/hall.ts`.** One file, so the numbers can be
compared against a Blender blockout and retuned in one place.

**`lib/hall.test.ts` checks the geometry, because WebGL cannot run here.** R3F
sizes itself with a ResizeObserver that a headless pane never delivers, so the
canvas never initialises and the usual "look at it" loop is unavailable. The
tests check that the numbers describe a coherent room: board fits its frame
opening, camera inside the building and pointed at the board, podium in shot,
nothing buried in a wall, haze thin enough to leave the board readable at the
camera's distance. They caught a board rendering 12.03m tall inside a 9.9m
opening, and a podium step sitting outside the camera frustum.

**It is a station platform, and that is a deliberate departure from the brief.**
The brief specifies a dark exchange hall, "a quiet trading floor at night". The
platform reading — tiled dado, beam ceiling, safety line, benches, practicals
receding down the room — was asked for explicitly and chosen over that. The
crowd is a departure from the brief too: five figures, and they are the actual
traders (you plus the four bots), not extras. When the cynic sells the roadmap
market down, that is his silhouette in the room and his name on the tape.

**Camera height is the load-bearing number.** At 5.8m the camera floated like a
drone and the figures read as scenery beneath it. At 1.75m — standing eye
height, among them — it becomes a point of view. Free look (`OrbitControls`) is
on a toggle and is mutually exclusive with the idle drift, since two things
writing the camera every frame means neither wins.

**The composition was set from Blender renders, not from arithmetic.** The tests
can prove the room is coherent; they cannot tell you it looks right, and the
first version passed every check while looking like a whiteboard on a wall. A
box blockout mirroring these exact numbers (`scratchpad/blockout.py`) was
rendered at three camera distances to choose one. What that changed:

- Hall depth 34 → 56. At 34 the camera stood outside the building.
- Camera 22m from the board → 38m, so columns run past it on both sides.
- Board frame fills ~41% of frame width, not ~70%. A third of the frame feels
  far too small on paper and is correct in practice — the columns and receding
  fixtures carry the sense of place, and the board only has to be the brightest
  thing in it. The framing test's target range was rewritten from the render.
- Fog density 0.021 → 0.0135. Thinner, because moving the camera back pushed
  the board's transmittance to 0.52 and the haze was eating it.
- The warm floor bounce was deleted. A point light near a floor lays down a
  hard elliptical pool; every reposition just moved the artifact.
- Room 44 x 16 x 56 → **28 x 9 x 44**. The 16m ceiling rendered a cathedral:
  ants for people, and a void of blank wall above the board. Platforms are low
  and wide, and that is most of why they feel like platforms.
- Four of the five figures were off-screen on the first pass. The frustum is
  barely a metre wide either side of centre at 1.6m from the lens, so anything
  placed close and wide is outside it. The room rendered deserted. There is now
  a test for it, as there is for the podium and the safety line — which was
  behind the camera and had never appeared in a single frame.

The MCP bridge to Blender does not work — the configured server speaks a
different protocol than the running addon, so every bridged call hangs. The
addon itself is healthy and answers raw JSON on `localhost:9876`;
`scratchpad/bl.mjs` talks to it directly.

## Two things worth knowing

**The LMSR lives twice.** `lib/lmsr.ts` quotes trades in the browser and drives
the bots; `lmsr_cost` / `lmsr_price_yes` in Postgres are authoritative. Both use
the same factored log-sum-exp so they agree to the cent. If you change one,
change the other and re-run the tests.

**No table has a write policy.** RLS is on everywhere with select-only policies.
Every mutation goes through a `SECURITY DEFINER` function called by a server
route holding the service role key, so a client with the anon key can read the
board but cannot mint credits or move a price. `execute_trade` takes a row lock
on the market before touching the balance, which is what makes two simultaneous
buyers produce two correctly priced sequential trades instead of a double spend.
The "no citation, no settlement" rule is a `CHECK` constraint rather than a code
path, so a buggy resolver cannot bypass it.
