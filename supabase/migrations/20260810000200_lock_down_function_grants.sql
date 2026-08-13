-- Follow-up to the initial deploy.
--
-- The first pass revoked EXECUTE from `anon` and `authenticated` only. That is
-- a no-op: Postgres grants EXECUTE on every new function to PUBLIC, and those
-- roles inherit through it, so `execute_trade`, `settle_market`, `void_market`
-- and `reset_room` were all still callable straight from the browser at
-- /rest/v1/rpc/<name> with the anon key. Anyone could have minted credits,
-- settled a market with a fabricated citation, or wiped the room.
--
-- Idempotent, so it is safe to run after a corrected init as well.

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

alter function lmsr_cost(numeric, numeric, numeric)      set search_path = public, pg_temp;
alter function lmsr_price_yes(numeric, numeric, numeric) set search_path = public, pg_temp;
alter function room_leaderboard(uuid)                    set search_path = public, pg_temp;
