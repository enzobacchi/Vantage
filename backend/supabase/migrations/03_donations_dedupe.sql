-- Make donations ingestion idempotent (MVP)
-- We store the QuickBooks SalesReceipt id in `memo` as `qb_sales_receipt_id:<id>...`
-- and enforce uniqueness per donor.

alter table public.donations
  add constraint donations_donor_id_memo_unique unique (donor_id, memo);

