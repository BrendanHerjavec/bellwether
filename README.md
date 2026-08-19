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

| Route           | What it is                                                     |
| --------------- | -------------------------------------------------------------- |
| `/`             | The argument for why this exists                               |
| `/play`         | **The trader view.** Balance, markets, stakes, positions, perks |
| `/board`        | The room display. The bulb board inside the 3D hall            |
| `/demo`         | **The whole loop in 88 seconds.** Board, ticket, settlement, report          |
| `/lab`          | The DOM split-flap board, with every animation knob exposed     |
| `/lab/raster`   | The hall's bulb board, flat and full size, with a manual step   |
| `/lab/textures` | Every generated surface in the room, flat and tiled 2×2         |
| `/lab/still`    | **One frame of the hall, rendered on demand.** See below        |

The three `/lab` pages under it are not decoration. This repo cannot render
WebGL — see "the hall" — so they are the only way anything in the room gets
looked at before it ships.

### Two surfaces, on purpose

`/play` is warm and light; `/board` is dark and cinematic. That is not an
inconsistency. The board is a physical object projected on a wall in a dimmed
room, and the brief is specific that it should read as a quiet trading floor at
night. The trader view is a page someone opens at their desk ten minutes before
the meeting, and it has to explain an unfamiliar idea fast. The thread between
them is the odds readout: the same markets, on the big board in the room and
inset as a small dark card on the trader's page.

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
- [~] 5. Settlement. The void path, payouts, citations and the leaderboard are
      built and run end to end at `/demo`. The resolver reads a fixture rather
      than an uploaded transcript and a model — `resolveFromTranscript()` in
      `lib/transcript.ts` is the one function that swap replaces.
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

## The demo

`/demo` runs the whole loop on a clock, in 88 seconds:

| Phase           | What happens                                                        |
| --------------- | ------------------------------------------------------------------- |
| Floor open      | 19s. Cold board, bots trading ~3/sec, your four calls land as beats  |
| Doors close     | 19s. Every market locks, closing prices stamped on the record        |
| The meeting     | 24–58s. Six markets settle, each with the line that decided it       |
| Three months on | 59–74s. The long-run markets settle against a record, not a quote    |
| Session closed  | 74s. Your report — won, lost, refunded — then the shelf it buys from |

| Key     | What it does                          |
| ------- | ------------------------------------- |
| `space` | Play / pause                          |
| `→`     | Skip to the next beat and fire it now |
| `r`     | Restart from a cold board             |

The room is deliberately not in it. `/board` renders the hall and can be
recorded separately and cut over the top; what this page owes a viewer is the
mechanism at a size they can read.

Four things about it are worth knowing before changing anything:

**Nothing on the page is demo-only logic.** Bets call the same `buy()`,
settlement calls the same resolver, and the board is the board. The director in
`components/demo/useDemoDirector.ts` only supplies timing — every action it
takes is one a presenter could take by hand.

**The board starts cold, and it has to.** An earlier version opened warm, with a
session already behind it, and it could not show anyone betting — only the
result of betting, which is the least interesting half. Now the director turns
the ambient bot loop off and drives `runBotTick()` itself every 350ms while the
doors are open, and never once they are shut. That is not a cosmetic speed-up:
at the real nine-to-fifteen second cadence a viewer watches a static board and
concludes the numbers are decoration. Nineteen seconds of floor at that tick is
still forty-odd trades — the same board the old 46-second floor produced.

**Your first call is the first thing that happens.** The informed trader holds a
view of 86% on the enterprise market against an opening price of 18 — the
largest mispricing on the board by a distance — so it goes there first and
arrives with full conviction. Three seconds of floor takes the price into the
thirties, and the same 120 credits then buys barely half the contracts. A long
shot is only a long shot if you are in before the crowd, so the script opens the
floor and places that bet on the same beat.

**Every gap is longer than the overlay that fills it.** That, not taste, is what
bounds how fast this can run: two settlements closer together than
`STAMP_DISMISS_MS` would stack one stamp on another and hand the second the
first’s leftover timer. The dismiss times are exported from the beat sheet and
the tests assert the gaps against them, so tightening the demo again forces them
to move together. At the current pace a citation is up for five seconds — enough
to take in, not enough to study, which is right for a sizzle reel and wrong for
a room asking questions. `space` holds any beat indefinitely.

**The beat sheet is data.** `lib/demo-script.ts` holds the timings, the order,
the caption for the screen and the line for whoever is talking. The order is
dramatic rather than chronological — the safe markets go first so the mechanism
is understood before it matters, the long shot lands fifth because it is the
biggest payout of the session, and the void goes last because a refusal only
means something once you have watched seven confident answers go up beside it.
One of your four calls loses and one is refunded, both on purpose: a presenter
who called everything right has shown an advertisement rather than a market.
`transcript.test.ts` guards the parts that would quietly ruin a take — every
market settles exactly once, every bet is placed while the floor is still open,
the doors lock before anything settles, nothing trades afterwards, and no
citation is quoted that is not actually in the transcript.

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

**The board is painted into a texture, and that reversed two decisions.**

It used to be a drei `<Html transform>`: real DOM, positioned by the camera
matrix but composited outside the canvas. The argument for it was crispness —
the digits stay real text instead of becoming a blurry texture. Two things
eventually outweighed that.

*It could not belong.* A layer outside the canvas receives no fog, no bloom, no
depth of field and no colour grade, and nothing in the scene can occlude it. It
was lit by CSS while everything around it was lit by three.js, which is exactly
what "it feels like an overlay" means. A CSS fog tint got it closer and could
never get it there, because the problem was compositing order.

*It could not be moved past.* drei rewrites the wrapper's CSS matrix every
frame. That wrapper held ~340 drums — some 3,700 nodes with preserve-3d,
gradients and box-shadows — and the browser re-rasterised the lot on the main
thread each time the camera moved. Walking the hall sat at 10–20fps for that
reason alone, with buttons that would not respond: a GPU bottleneck cannot block
a click, a main-thread one can.

So `components/board/board-raster.ts` paints the board into a 2D canvas and
`BoardScreen` maps it onto a mesh. The cost is bounded by painting **only what
moved**: the repaint is banded, the texture is uploaded only on frames that
changed something, and a board with nothing happening on it costs nothing.

Two bands exist purely because of that discipline, and both were measured
rather than guessed. The trade counter in the header changes on every trade —
marking the whole board dirty for it meant repainting twenty-two thousand bulbs
several times a second for two digits, so the header repaints alone. And a
price change repaints the price cell alone, because the question beside it is
twenty-one characters of eleven-row dot grid — some two and a half thousand
bulbs that have not changed and will not.

**And it is no longer a split-flap.** It was a Solari departure board: genuinely
charming, and a *train station's* display hanging in a sportsbook — the last
thing in the scene still speaking the language the room used to speak. It is
now the 1970s race-and-sports book equivalent: incandescent bulbs on a black
field.

That change was made by looking. Four candidates were painted at full size with
real data — split-flap, bulb, flip-dot, and a bookmaker's chalkboard — and the
bulb board won on three counts: it is the display this room would actually have,
bright-points-on-black is the most legible thing you can hang on a wall, and it
is about a third the drawing cost per character of a flap. It also finally made
the board **readable from the camera**, which the split-flap never was.

Two things about rendering text as dots are worth keeping:

- **There is no bitmap font.** `textDots` draws real text into a tiny offscreen
  canvas and lights a dot wherever a pixel came out dark enough. That is roughly
  how sign-driver software works, it costs no font data, and any string renders
  in the app's own typeface for free.
- **The face and the threshold are both load-bearing.** Drawn in the board's own
  condensed face at seven dot-rows, "PRICING CHANGE NAMED" rendered as
  "PBICIOB CHAOBE HAMED" — a condensed letter is four dots wide, which cannot
  keep B from R. Eleven rows of Inter fixes that; dropping the alpha threshold
  from 128 to 60 fixes the rest, because at 128 the thin diagonals vanish and M
  reads as N, Q as O.

The information changed with the mechanism. A row is no longer a spreadsheet
line: the question carries a rule underneath showing **credits actually at
risk** (outstanding shares, straight off the market maker's state), a session
line shows the shape of where the room has been, and the price is the headline.
That hierarchy is deliberate and `lib/hall.test.ts` pins it — from a seat the
whole board is about 500 screen pixels wide, so the label is four pixels tall
and legible to nobody. The price and the shape are what read from the room; the
question is a detail you get by walking over.

Two things carry the "set into the wall" reading:

1. **The screen is a light.** `ScreenLight` puts real lights at the board's
   position, so the reveals, the seat backs and the nearest heads are lit *by*
   the screen — as an audience is in a real auditorium.
2. **There is glass, hanging well in front of the drums.** The panel sits at
   the back of the opening and the pane near the front of the bezel, eight
   centimetres apart, with the bezel deep enough to swallow both. The reflection
   slides across the board as you walk, and that parallax is the entire effect —
   collapse the gap and it becomes a decal.

**A third thing used to be there, and taking it out is the lesson.**
`ScreenHalo` was an emissive plane slightly *larger* than the board, sitting a
centimetre nearer the camera, so the bloom pass would bleed glow past the DOM
board's edges and hide the seam. It was harmless for exactly as long as the
board was composited on top of the canvas, because the depth buffer did not get
a say. The moment the board became geometry, an opaque oversized rectangle was
in front of it and the screen went blank.

`lib/hall.test.ts` now declares the depth order of the whole assembly — recess
face, panel, tape, glass, bezel — and asserts nothing opaque sits between the
camera and the panel. That is the check that would have caught it without ever
rendering a frame, which matters here, because this repo cannot render one.

`/lab/raster` shows the painted texture flat and full size, with a manual step,
because in the hall it is a texture at an angle in a hazy room behind glass —
and there is otherwise no way to tell a mispainted bulb from a bad camera angle.

**Brightness and depth are separate controls.** Thinning the fog to fix "too
dark" flattened the hall into a lit box with no distance in it. `EXPOSURE`
carries the brightness; the fog stays dense enough to dissolve the far corners.
The board sits at 94% transmittance, the far end of the room at 81%.

**Quality tiers, and a renderer that finds its own resolution.** Four things
dominate the frame budget, in order: the floor's real-time reflection (an extra
render of the scene, blurred, every frame), device pixel ratio (quadratic — dpr
2 is 3.2M pixels on a 1600x900 canvas, dpr 1.5 is 1.8M), depth of field, and
shadow mapping. `balanced` keeps the reflection and the bloom, which are what
the room is made of, and drops the other two. On top of that, drei's
`PerformanceMonitor` slides the pixel ratio **within the tier's own range**, so
the tier buttons set a ceiling and the machine finds what it can hold under it.

There is also a lighting cost that is easy to miss: every material loops over
every light, per fragment, and the reflection makes it do that twice. Ten
ceiling point lights in a row was the most expensive thing in the shader. All
ten fixtures still glow — the emissive planes are what you actually see receding
into the haze, and they cost nothing — but only every third is a real light.

**Nothing is allowed in front of the screen, and it is no longer a technical
constraint.** It used to be one: the board was DOM composited outside the
canvas, so geometry physically could not occlude it and a figure between the
camera and the screen rendered *behind* it. The board is a mesh now and occludes
correctly. The auditorium staging stayed regardless, because it is good staging.
Anything below the camera's eye height projects below the horizon line, so
seating everybody guarantees a clean read of the odds from anywhere in the room,
which is the entire job of a tote board. `lib/hall.test.ts` still asserts it.

The screen is set into a real opening cut through the back wall, with reveals
lining its sides, rather than hung in front of a flat plane. The shadow down the
reveal is what tells the eye it is part of the building.

**Walking the hall removes you from it.** In every other camera mode the figure
labelled "You" is where you are sitting. In walk mode the camera *is* you, so
leaving the figure in puts a second you in the room — one you can walk up to and
read the name tag of, which is a stranger sight than an empty seat.

**React context does not cross the Canvas boundary.** R3F runs its own
reconciler. A board that read `useTrading()` threw "must be used inside a
TradingProvider" and took the whole scene down; re-providing the context inside
the Canvas did not fix it either. So `TotBoardView` and `TickerView` take every
piece of state as props and touch no context at all, and the hall is handed
markets and trades directly. `components/board/TotBoard.test.tsx` renders both
with no provider mounted, which is exactly the condition inside the Canvas.

**There is no DOM inside the hall at all.** The name tags over the traders were
the last of it, and they had the board's problem in miniature: they could not be
occluded, so they sat in front of columns they were behind, and stayed pin-sharp
at the back of the room while their owners hazed out. They are painted sprites
now (`nameTagTexture`), simply in the room like everything else.

**Every dimension lives in `lib/hall.ts`.** One file, so the numbers can be
compared against a Blender blockout and retuned in one place.

**`/lab/still` renders one frame of the hall on demand, and it is the reason
any of the lighting above could be chosen at all.**

R3F sizes itself with a ResizeObserver and drives itself with
requestAnimationFrame. Both are delivered as part of the browser's rendering
steps, so in a pane that is not compositing — headless preview, background tab,
CI — neither ever fires, the `<Canvas>` never configures itself, and the scene
does not merely fail to appear, it is never constructed. Every camera, palette
and lighting decision in this room was being made blind.

R3F ships the escape hatch: `createRoot(canvas).configure({ size, frameloop:
"never" })` takes both dependencies out of play — an explicit size instead of
measuring, manual `advance()` instead of a loop. The lab page mounts the *real*
`<HallContents>` against such a root, advances it a few steps, and the canvas
can be read back with `toDataURL`. Three things about it cost an hour each and
are worth writing down:

- **`<Canvas>` calls `extend(THREE)` and `createRoot` does not.** Without it
  every intrinsic element throws "is not part of the THREE namespace", nothing
  mounts, and the only symptom is a blank canvas.
- **A canvas gets exactly one context, ever.** `root.unmount()` disposes the
  renderer, which calls `forceContextLoss()`; StrictMode double-invokes effects
  in development, so a canvas held in a ref is dead on the second run and fails
  as `cannot read properties of null (reading 'precision')` deep inside three.
  The page builds a fresh `<canvas>` element per mount.
- **`advance()` takes milliseconds**, like `performance.now()`. Passing seconds
  advances the scene by microseconds and looks exactly like nothing happening.

It renders the real scene rather than a copy of it, which is the point — a
previz that drifts from the thing it previsualises is worse than none.
`/lab/textures` does the same job for the generated surfaces, and `/lab/raster`
for the board.

**`lib/hall.test.ts` still checks the geometry, because a still is not a proof.**
The
tests check that the numbers describe a coherent room: board fits its frame
opening, camera inside the building and pointed at the board, podium in shot,
nothing buried in a wall, haze thin enough to leave the board readable at the
camera's distance. They caught a board rendering 12.03m tall inside a 9.9m
opening, and a podium step sitting outside the camera frustum.

**It is a Vegas sportsbook, and it used to be a station platform.**

The brief specifies a dark exchange hall, "a quiet trading floor at night". The
station reading — glazed tile, poured concrete, a painted safety line — was
chosen over that, and then replaced in turn, because the diagnosis for "the room
is ugly" turned out to be measurable rather than a matter of taste:

| surface | hue | sat |
|---|---|---|
| wall render | 217° | 18% |
| ceiling | 222° | 27% |
| columns | 224° | 31% |
| floor | 230° | 38% |
| ambient light | 219° | 20% |
| fog | 218° | 44% |

Every surface in the hall sat within a **13° hue spread** — one blue-grey at
twelve brightnesses, with a cool ambient and a cool fog over the top of it. That
is not a dark room, it is a monochrome one, and no amount of extra light was
going to fix it. `lib/palette.ts` is the answer and the whole colour scheme now
lives there: carpet, walnut, brass, oxblood, low amber lamps, and one wall of
blue-white screens to be warm *against*. A sportsbook is also the room that
makes a giant split-flap tote board make sense.

Two things are worth knowing about that change:

*It made the scene cheaper.* A sportsbook has carpet, not polished concrete, so
the floor's `MeshReflectorMaterial` — an extra render of the whole scene,
blurred, every frame, and the single most expensive thing in the room — went out
with the station. Prettier and faster in the same commit is not the usual trade.

*Almost none of the new light is a real light.* Pendant globes, ceiling coves,
the bottle shelf and the neon are emissive geometry that the bloom pass turns
into glow. Every real light is paid for by every material in the scene, per
fragment, per frame — so all eight pendants glow and four of them light, all
nine coves glow and three of them light, and nobody can tell.

The crowd is a departure from the brief too: five figures, and they are the
actual traders (you plus the four bots), not extras. When the cynic sells the
roadmap market down, that is his silhouette in the room and his name on the
tape. They stand, lean on the bar and perch at the high tables — see the note on
`AVATARS` for why they used to have to be sitting down.

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
