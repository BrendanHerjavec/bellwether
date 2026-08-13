-- Bellwether: internal prediction market for all hands meetings.
--
-- Design notes that matter:
--   * All writes go through SECURITY DEFINER functions. No table has an INSERT,
--     UPDATE or DELETE policy, so a client holding the anon key can read the
--     board but cannot mint itself credits or move a price.
--   * execute_trade() does the whole trade in one transaction under a row lock,
--     so two simultaneous buyers produce two correctly priced sequential trades.
--   * The "no citation, no settlement" rule is a CHECK constraint, not a code
--     path. It cannot be bypassed by a buggy resolver.

-- ---------------------------------------------------------------- enum types

create type room_phase as enum ('pre', 'live', 'settling', 'closed');
create type market_kind as enum ('meeting', 'outcome');
create type market_status as enum ('draft', 'open', 'locked', 'settled', 'void');
create type outcome_side as enum ('YES', 'NO');
create type bot_persona as enum ('optimist', 'cynic', 'contrarian', 'insider');

-- --------------------------------------------------------------------- rooms

create table rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code = upper(code) and length(code) between 3 and 12),
  name        text not null,
  phase       room_phase not null default 'pre',
  -- Credits every trader starts with. Play currency, never convertible.
  starting_balance numeric(12, 2) not null default 1000 check (starting_balance > 0),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------ traders

create table traders (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references rooms(id) on delete cascade,
  display_name   text not null check (length(trim(display_name)) between 1 and 40),
  balance        numeric(12, 2) not null default 1000 check (balance >= 0),
  is_bot         boolean not null default false,
  persona        bot_persona,
  -- Leadership trades are shown publicly; everyone else's stay anonymous.
  is_leadership  boolean not null default false,
  -- A presenter is blocked from trading markets tied to their own announcements.
  is_presenter   boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint persona_only_for_bots check (persona is null or is_bot)
);

create unique index traders_room_name_key on traders (room_id, lower(display_name));
create index traders_room_idx on traders (room_id);

-- ------------------------------------------------------------------ markets

create table markets (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  slug          text not null,
  question      text not null,
  subtitle      text,
  kind          market_kind not null default 'meeting',
  status        market_status not null default 'open',

  -- LMSR state. b is the liquidity parameter; q_yes/q_no are outstanding
  -- contracts. Price of YES = exp(q_yes/b) / (exp(q_yes/b) + exp(q_no/b)).
  -- Must stay in step with DEFAULT_LIQUIDITY in lib/lmsr.ts. Tuned so a 50
  -- credit stake moves a market a few points rather than thirty.
  b             numeric(12, 4) not null default 1200 check (b > 0),
  q_yes         numeric(14, 4) not null default 0,
  q_no          numeric(14, 4) not null default 0,
  opening_price numeric(6, 5) not null check (opening_price > 0 and opening_price < 1),

  -- Outcome markets resolve weeks or months out; this is the human explanation.
  resolves_note text,

  -- Insider rule: the trader who is presenting this topic cannot trade it.
  presenter_trader_id uuid references traders(id) on delete set null,

  -- Settlement. Enforced below: settled markets must carry a transcript citation.
  resolution          outcome_side,
  citation_text       text,
  citation_timestamp  text,
  resolver_reasoning  text,
  void_reason         text,
  settled_at          timestamptz,

  sort_order    integer not null default 0,
  last_trade_at timestamptz,
  created_at    timestamptz not null default now(),

  -- Voiding is a first class outcome, so it gets its own required explanation.
  constraint settled_requires_citation check (
    status <> 'settled'
    or (
      resolution is not null
      and citation_text is not null and length(trim(citation_text)) > 0
      and citation_timestamp is not null and length(trim(citation_timestamp)) > 0
    )
  ),
  constraint void_requires_reason check (
    status <> 'void' or (void_reason is not null and length(trim(void_reason)) > 0)
  ),
  constraint resolution_only_when_settled check (
    resolution is null or status = 'settled'
  )
);

create unique index markets_room_slug_key on markets (room_id, slug);
create index markets_room_sort_idx on markets (room_id, sort_order);

-- ---------------------------------------------------------------- positions

create table positions (
  market_id      uuid not null references markets(id) on delete cascade,
  trader_id      uuid not null references traders(id) on delete cascade,
  yes_shares     numeric(14, 4) not null default 0 check (yes_shares >= 0),
  no_shares      numeric(14, 4) not null default 0 check (no_shares >= 0),
  -- Total credits paid in. This is exactly what a void refunds.
  credits_staked numeric(12, 2) not null default 0 check (credits_staked >= 0),
  payout         numeric(12, 2),
  primary key (market_id, trader_id)
);

create index positions_trader_idx on positions (trader_id);

-- ------------------------------------------------------------------- trades

create table trades (
  -- bigint identity, so the ticker tape has an unambiguous order.
  id           bigint generated always as identity primary key,
  market_id    uuid not null references markets(id) on delete cascade,
  trader_id    uuid not null references traders(id) on delete cascade,
  side         outcome_side not null,
  shares       numeric(14, 4) not null check (shares > 0),
  cost         numeric(12, 2) not null check (cost > 0),
  price_before numeric(6, 5) not null,
  price_after  numeric(6, 5) not null,
  -- Leadership trades are attributed on the ticker; ordinary trades are not.
  is_public    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index trades_market_idx on trades (market_id, id desc);
create index trades_room_recent_idx on trades (id desc);

-- -------------------------------------------------------------- transcripts

create table transcripts (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  body        text not null,
  uploaded_at timestamptz not null default now()
);

-- ----------------------------------------------------------- screening log

-- Every market question proposed by the host, and what the screener said.
-- Rejections are kept: the audit trail is the point of the guardrail.
create table screening_log (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid references rooms(id) on delete cascade,
  question   text not null,
  allowed    boolean not null,
  reason     text not null,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- perks

-- What credits are actually for. Never money.
create table perks (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  name        text not null,
  description text not null,
  price       numeric(12, 2) not null check (price > 0),
  sort_order  integer not null default 0
);

-- ============================================================ LMSR in SQL ===
-- Mirrors lib/lmsr.ts. The TypeScript copy quotes and drives bots; this copy is
-- authoritative. Both use the same factored log-sum-exp so they agree.

create or replace function lmsr_cost(q_yes numeric, q_no numeric, b numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  a  double precision;
  c  double precision;
  hi double precision;
  lo double precision;
begin
  if b is null or b <= 0 then
    raise exception 'lmsr_cost: liquidity b must be positive, got %', b;
  end if;
  a := q_yes::double precision / b::double precision;
  c := q_no::double precision / b::double precision;
  hi := greatest(a, c);
  lo := least(a, c);
  -- exp(lo - hi) is in (0,1], so this never overflows however lopsided the book.
  return (b::double precision * (hi + ln(1 + exp(greatest(lo - hi, -745)))))::numeric;
end;
$$;

create or replace function lmsr_price_yes(q_yes numeric, q_no numeric, b numeric)
returns numeric
language sql
immutable
as $$
  -- Logistic form. The exponent is clamped so an extreme book saturates at the
  -- asymptote instead of raising a floating point overflow.
  select round(
    (1.0 / (1.0 + exp(
      least(greatest(((q_no - q_yes) / b)::double precision, -700), 700)
    )))::numeric,
    5
  );
$$;

-- ========================================================= execute_trade ===
--
-- One transaction: check the market is open, check the balance, compute the
-- LMSR cost, update quantities, debit the trader, record the trade.
--
-- Locking order is always markets -> traders. Every writer takes the same
-- order, so concurrent buyers serialise rather than deadlock, and each one
-- reads the quantities the previous one committed.

create or replace function execute_trade(
  p_trader_id uuid,
  p_market_id uuid,
  p_side      outcome_side,
  p_shares    numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m             markets%rowtype;
  t             traders%rowtype;
  v_q_yes       numeric;
  v_q_no        numeric;
  v_cost        numeric;
  v_price_before numeric;
  v_price_after  numeric;
  v_trade_id    bigint;
  v_is_public   boolean;
begin
  if p_shares is null or p_shares <= 0 then
    raise exception 'Trade size must be a positive number of contracts'
      using errcode = 'BW001';
  end if;
  if p_shares > 5000 then
    raise exception 'Trade size is capped at 5000 contracts'
      using errcode = 'BW001';
  end if;

  select * into m from markets where id = p_market_id for update;
  if not found then
    raise exception 'Market not found' using errcode = 'BW002';
  end if;
  if m.status <> 'open' then
    raise exception 'Market is % and not open for trading', m.status
      using errcode = 'BW003';
  end if;

  select * into t from traders where id = p_trader_id for update;
  if not found then
    raise exception 'Trader not found' using errcode = 'BW002';
  end if;
  if t.room_id <> m.room_id then
    raise exception 'Trader is not in this room' using errcode = 'BW004';
  end if;

  -- Insider rule. A presenter cannot trade the market covering their own slide.
  if m.presenter_trader_id is not null and m.presenter_trader_id = t.id then
    raise exception 'Presenters cannot trade markets on their own announcements'
      using errcode = 'BW005';
  end if;

  v_price_before := lmsr_price_yes(m.q_yes, m.q_no, m.b);

  if p_side = 'YES' then
    v_q_yes := m.q_yes + p_shares;
    v_q_no  := m.q_no;
  else
    v_q_yes := m.q_yes;
    v_q_no  := m.q_no + p_shares;
  end if;

  v_cost := round(
    lmsr_cost(v_q_yes, v_q_no, m.b) - lmsr_cost(m.q_yes, m.q_no, m.b),
    2
  );

  -- Rounding down to zero would let a trader accumulate contracts for free.
  if v_cost <= 0 then
    raise exception 'Trade too small to price' using errcode = 'BW001';
  end if;
  if v_cost > t.balance then
    raise exception 'Not enough credits: this costs % but the balance is %',
      v_cost, t.balance
      using errcode = 'BW006';
  end if;

  update markets
     set q_yes = v_q_yes,
         q_no = v_q_no,
         last_trade_at = now()
   where id = m.id;

  -- The balance >= 0 CHECK is the backstop: if two transactions ever did slip
  -- past the row lock, the second one aborts here rather than double spending.
  update traders set balance = balance - v_cost where id = t.id;

  insert into positions (market_id, trader_id, yes_shares, no_shares, credits_staked)
  values (
    m.id, t.id,
    case when p_side = 'YES' then p_shares else 0 end,
    case when p_side = 'NO'  then p_shares else 0 end,
    v_cost
  )
  on conflict (market_id, trader_id) do update
    set yes_shares     = positions.yes_shares + excluded.yes_shares,
        no_shares      = positions.no_shares + excluded.no_shares,
        credits_staked = positions.credits_staked + excluded.credits_staked;

  v_price_after := lmsr_price_yes(v_q_yes, v_q_no, m.b);
  v_is_public := t.is_leadership;

  insert into trades (
    market_id, trader_id, side, shares, cost, price_before, price_after, is_public
  )
  values (
    m.id, t.id, p_side, p_shares, v_cost, v_price_before, v_price_after, v_is_public
  )
  returning id into v_trade_id;

  return jsonb_build_object(
    'trade_id',     v_trade_id,
    'market_id',    m.id,
    'market_slug',  m.slug,
    'question',     m.question,
    'trader_id',    t.id,
    -- Only leadership is named on the wire. Everyone else is a silhouette.
    'trader_name',  case when v_is_public then t.display_name else null end,
    'is_public',    v_is_public,
    'is_bot',       t.is_bot,
    'side',         p_side,
    'shares',       p_shares,
    'cost',         v_cost,
    'price_before', v_price_before,
    'price_after',  v_price_after,
    'q_yes',        v_q_yes,
    'q_no',         v_q_no,
    'balance',      t.balance - v_cost,
    'created_at',   now()
  );
end;
$$;

-- ========================================================= settle_market ===
--
-- Pays 1 credit per winning contract. The citation arguments are mandatory:
-- a resolver that cannot quote the transcript must void instead.

create or replace function settle_market(
  p_market_id         uuid,
  p_resolution        outcome_side,
  p_citation_text     text,
  p_citation_timestamp text,
  p_reasoning         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m         markets%rowtype;
  v_paid    numeric := 0;
  v_winners integer := 0;
begin
  if p_citation_text is null or length(trim(p_citation_text)) = 0
     or p_citation_timestamp is null or length(trim(p_citation_timestamp)) = 0 then
    raise exception 'Settlement requires a transcript citation with a timestamp'
      using errcode = 'BW007';
  end if;

  select * into m from markets where id = p_market_id for update;
  if not found then
    raise exception 'Market not found' using errcode = 'BW002';
  end if;
  if m.status in ('settled', 'void') then
    raise exception 'Market is already %', m.status using errcode = 'BW003';
  end if;

  -- Credit each winning position, and record what every position earned so the
  -- leaderboard can show the round's profit and loss.
  with settled as (
    update positions p
       set payout = round(
             case when p_resolution = 'YES' then p.yes_shares else p.no_shares end,
             2
           )
     where p.market_id = m.id
     returning p.trader_id, p.payout
  ), credited as (
    update traders tr
       set balance = tr.balance + s.payout
      from settled s
     where tr.id = s.trader_id and s.payout > 0
     returning s.payout
  )
  select coalesce(sum(payout), 0), count(*) into v_paid, v_winners from credited;

  update markets
     set status = 'settled',
         resolution = p_resolution,
         citation_text = trim(p_citation_text),
         citation_timestamp = trim(p_citation_timestamp),
         resolver_reasoning = p_reasoning,
         settled_at = now()
   where id = m.id;

  return jsonb_build_object(
    'market_id',          m.id,
    'market_slug',        m.slug,
    'question',           m.question,
    'status',             'settled',
    'resolution',         p_resolution,
    'citation_text',      trim(p_citation_text),
    'citation_timestamp', trim(p_citation_timestamp),
    'reasoning',          p_reasoning,
    'credits_paid',       v_paid,
    'winners',            v_winners
  );
end;
$$;

-- =========================================================== void_market ===
--
-- Refunds every credit staked. A void is a clean outcome, not an error state:
-- being able to unwind an ambiguous market is what makes the other settlements
-- trustworthy.

create or replace function void_market(p_market_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m           markets%rowtype;
  v_refunded  numeric := 0;
  v_traders   integer := 0;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Voiding a market requires a reason' using errcode = 'BW007';
  end if;

  select * into m from markets where id = p_market_id for update;
  if not found then
    raise exception 'Market not found' using errcode = 'BW002';
  end if;
  if m.status in ('settled', 'void') then
    raise exception 'Market is already %', m.status using errcode = 'BW003';
  end if;

  with refunds as (
    update positions p
       set payout = p.credits_staked
     where p.market_id = m.id
     returning p.trader_id, p.credits_staked as amount
  ), credited as (
    update traders tr
       set balance = tr.balance + r.amount
      from refunds r
     where tr.id = r.trader_id and r.amount > 0
     returning r.amount
  )
  select coalesce(sum(amount), 0), count(*) into v_refunded, v_traders from credited;

  update markets
     set status = 'void',
         void_reason = trim(p_reason),
         settled_at = now()
   where id = m.id;

  return jsonb_build_object(
    'market_id',        m.id,
    'market_slug',      m.slug,
    'question',         m.question,
    'status',           'void',
    'void_reason',      trim(p_reason),
    'credits_refunded', v_refunded,
    'traders_refunded', v_traders
  );
end;
$$;

-- ====================================================== market lifecycle ===

create or replace function set_market_status(p_market_id uuid, p_status market_status)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m markets%rowtype;
begin
  if p_status in ('settled', 'void') then
    raise exception 'Use settle_market or void_market to close a market'
      using errcode = 'BW003';
  end if;

  select * into m from markets where id = p_market_id for update;
  if not found then
    raise exception 'Market not found' using errcode = 'BW002';
  end if;
  if m.status in ('settled', 'void') then
    raise exception 'Market is already % and cannot reopen', m.status
      using errcode = 'BW003';
  end if;

  update markets set status = p_status where id = m.id;
  return jsonb_build_object('market_id', m.id, 'status', p_status);
end;
$$;

create or replace function set_room_phase(p_room_id uuid, p_phase room_phase)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update rooms set phase = p_phase where id = p_room_id;
  if not found then
    raise exception 'Room not found' using errcode = 'BW002';
  end if;
  -- Locking the room for settlement stops trading everywhere at once.
  if p_phase = 'settling' then
    update markets set status = 'locked'
     where room_id = p_room_id and status = 'open' and kind = 'meeting';
  end if;
  return jsonb_build_object('room_id', p_room_id, 'phase', p_phase);
end;
$$;

-- ============================================================ join_room ===
--
-- Authentication is a display name and a room code, by design. Re-joining with
-- the same name returns the same trader so a refresh does not mint a new purse.

create or replace function join_room(p_room_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r rooms%rowtype;
  t traders%rowtype;
begin
  select * into r from rooms where code = upper(trim(p_room_code));
  if not found then
    raise exception 'No room with code %', upper(trim(p_room_code))
      using errcode = 'BW002';
  end if;

  select * into t from traders
   where room_id = r.id and lower(display_name) = lower(trim(p_display_name));

  if not found then
    insert into traders (room_id, display_name, balance)
    values (r.id, trim(p_display_name), r.starting_balance)
    returning * into t;
  end if;

  return jsonb_build_object(
    'room_id',       r.id,
    'room_code',     r.code,
    'room_name',     r.name,
    'phase',         r.phase,
    'trader_id',     t.id,
    'display_name',  t.display_name,
    'balance',       t.balance,
    'is_leadership', t.is_leadership,
    'is_presenter',  t.is_presenter
  );
end;
$$;

-- ============================================================ leaderboard ===

create or replace function room_leaderboard(p_room_id uuid)
returns table (
  trader_id     uuid,
  display_name  text,
  is_bot        boolean,
  persona       bot_persona,
  is_leadership boolean,
  balance       numeric,
  staked        numeric,
  net           numeric,
  markets_traded integer
)
language sql
stable
as $$
  select
    t.id,
    t.display_name,
    t.is_bot,
    t.persona,
    t.is_leadership,
    t.balance,
    coalesce(sum(p.credits_staked) filter (where m.status = 'open' or m.status = 'locked'), 0) as staked,
    -- Net position counts credits still tied up in open markets at cost, so a
    -- trader is never punished on the board for simply holding contracts.
    t.balance
      + coalesce(sum(p.credits_staked) filter (where m.status in ('open', 'locked')), 0)
      - r.starting_balance as net,
    count(distinct p.market_id) filter (where p.credits_staked > 0)::integer
  from traders t
  join rooms r on r.id = t.room_id
  left join positions p on p.trader_id = t.id
  left join markets m on m.id = p.market_id
  where t.room_id = p_room_id
  group by t.id, t.display_name, t.is_bot, t.persona, t.is_leadership, t.balance, r.starting_balance
  order by net desc, t.display_name asc;
$$;

-- ============================================================ reset_room ===
--
-- Rewinds a room to its opening state so the demo can be recorded repeatedly.

create or replace function reset_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r rooms%rowtype;
begin
  select * into r from rooms where id = p_room_id;
  if not found then
    raise exception 'Room not found' using errcode = 'BW002';
  end if;

  delete from trades where market_id in (select id from markets where room_id = r.id);
  delete from positions where market_id in (select id from markets where room_id = r.id);
  delete from transcripts where room_id = r.id;
  delete from screening_log where room_id = r.id;
  delete from traders where room_id = r.id and is_bot;

  update traders set balance = r.starting_balance where room_id = r.id;

  update markets m
     set status = case when m.kind = 'meeting' then 'open'::market_status else 'open'::market_status end,
         resolution = null,
         citation_text = null,
         citation_timestamp = null,
         resolver_reasoning = null,
         void_reason = null,
         settled_at = null,
         last_trade_at = null,
         q_yes = case
           when m.opening_price >= 0.5
             then round((m.b * ln(m.opening_price / (1 - m.opening_price)))::numeric, 4)
           else 0
         end,
         q_no = case
           when m.opening_price < 0.5
             then round((m.b * ln((1 - m.opening_price) / m.opening_price))::numeric, 4)
           else 0
         end
   where m.room_id = r.id;

  update rooms set phase = 'pre' where id = r.id;

  return jsonb_build_object('room_id', r.id, 'reset', true);
end;
$$;

-- ================================================================== RLS ====
--
-- Read the board freely. Change it only through the functions above, which the
-- server calls with the service role. There is deliberately no INSERT, UPDATE
-- or DELETE policy on any table.

alter table rooms         enable row level security;
alter table traders       enable row level security;
alter table markets       enable row level security;
alter table positions     enable row level security;
alter table trades        enable row level security;
alter table transcripts   enable row level security;
alter table screening_log enable row level security;
alter table perks         enable row level security;

create policy "rooms are readable"         on rooms         for select using (true);
create policy "traders are readable"       on traders       for select using (true);
create policy "markets are readable"       on markets       for select using (true);
create policy "positions are readable"     on positions     for select using (true);
create policy "trades are readable"        on trades        for select using (true);
create policy "transcripts are readable"   on transcripts   for select using (true);
create policy "screening log is readable"  on screening_log for select using (true);
create policy "perks are readable"         on perks         for select using (true);

-- Mutating functions are server-only. The browser never calls these directly;
-- it posts to a route handler which uses the service role key.
--
-- Note the `public` in the revoke list. Postgres grants EXECUTE on every new
-- function to PUBLIC by default, and anon/authenticated inherit through that
-- grant — revoking from those two roles alone leaves the function wide open at
-- /rest/v1/rpc/<name>. Revoke from PUBLIC, then re-grant to service_role only.
revoke execute on function execute_trade(uuid, uuid, outcome_side, numeric) from public, anon, authenticated;
revoke execute on function settle_market(uuid, outcome_side, text, text, text) from public, anon, authenticated;
revoke execute on function void_market(uuid, text) from public, anon, authenticated;
revoke execute on function set_market_status(uuid, market_status) from public, anon, authenticated;
revoke execute on function set_room_phase(uuid, room_phase) from public, anon, authenticated;
revoke execute on function join_room(text, text) from public, anon, authenticated;
revoke execute on function reset_room(uuid) from public, anon, authenticated;

grant execute on function execute_trade(uuid, uuid, outcome_side, numeric) to service_role;
grant execute on function settle_market(uuid, outcome_side, text, text, text) to service_role;
grant execute on function void_market(uuid, text) to service_role;
grant execute on function set_market_status(uuid, market_status) to service_role;
grant execute on function set_room_phase(uuid, room_phase) to service_role;
grant execute on function join_room(text, text) to service_role;
grant execute on function reset_room(uuid) to service_role;

-- The read-only helpers stay callable by anon: they are pure, and the data
-- room_leaderboard reads is already exposed by the select policies above.
-- Pin their search_path so a hostile schema cannot shadow what they resolve.
alter function lmsr_cost(numeric, numeric, numeric)      set search_path = public, pg_temp;
alter function lmsr_price_yes(numeric, numeric, numeric) set search_path = public, pg_temp;
alter function room_leaderboard(uuid)                    set search_path = public, pg_temp;
