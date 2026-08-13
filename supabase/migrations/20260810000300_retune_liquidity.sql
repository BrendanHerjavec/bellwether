-- Liquidity was tuned against a contract count, but traders stake credits.
-- On a long shot, cheap contracts mean a fixed credit stake buys a far larger
-- quantity, so a 250 credit stake was moving an 18% market to 56% — the exact
-- thirty point swing the design is meant to avoid. Retuned so the default 50
-- credit stake moves a market two to three points.
--
-- Must stay in step with DEFAULT_LIQUIDITY in lib/lmsr.ts.

alter table markets alter column b set default 1200;

-- Bring any already-seeded markets along, and re-derive their quantities so
-- each one still opens at the price it was seeded with. Only markets that have
-- not traded yet are touched; b cannot be changed under an open position
-- without silently repricing it.
update markets m
   set b = 1200,
       q_yes = case
         when m.opening_price >= 0.5
           then round((1200 * ln(m.opening_price / (1 - m.opening_price)))::numeric, 4)
         else 0
       end,
       q_no = case
         when m.opening_price < 0.5
           then round((1200 * ln((1 - m.opening_price) / m.opening_price))::numeric, 4)
         else 0
       end
 where m.b <> 1200
   and not exists (select 1 from trades t where t.market_id = m.id);
