-- Track QuickBooks connection health so a revoked/expired authorization
-- surfaces as "needs reconnect" instead of falsely showing "Connected".
--
-- Background: when Intuit revokes a realm's grant, the access-token refresh can
-- still succeed while every API query is denied (401 AuthorizationFault, code
-- 120). The sync then fails forever without clearing tokens, so the UI keeps
-- showing "Connected" and nobody is prompted to reconnect. These columns let
-- the sync flag a dead connection and the UI surface a Reconnect banner.

alter table organizations
  add column if not exists qb_needs_reconnect boolean not null default false,
  add column if not exists qb_last_sync_error text;

comment on column organizations.qb_needs_reconnect is
  'True when the last QuickBooks sync failed with an auth/authorization error and the org must re-run the OAuth consent flow. Cleared on a successful sync.';
comment on column organizations.qb_last_sync_error is
  'Last QuickBooks sync error message, for display/debugging. Cleared on successful sync.';
