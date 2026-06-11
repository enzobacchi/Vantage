# Vantage REST API v1

Read-only access to your organization's contacts (donors) and donations.
Available on the Growth plan and above.

## Authentication

Create an API key in **Settings → API Keys**, then pass it on every request:

```
Authorization: Bearer vk_live_...
```

Keys are shown once at creation. Revoke and re-create keys at any time in
Settings — revoked keys fail immediately with `401`.

## Conventions

- Base URL: `https://app.vantagedonorai.com`
- All responses are JSON.
- List endpoints return `{ "data": [...], "pagination": { "has_more": bool, "next_cursor": string|null } }`.
  Pass `next_cursor` back as `?cursor=` to fetch the next page. `limit` defaults
  to 25, max 100.
- Single-resource endpoints return `{ "data": {...} }`.
- Errors return `{ "error": { "code": string, "message": string } }` with an
  appropriate HTTP status: `401 unauthorized`, `403 plan_required` /
  `insufficient_scope`, `404 not_found`, `400 invalid_request`,
  `429 rate_limited` (includes a `Retry-After` header), `500 internal_error`.
- Rate limit: 60 requests/minute per key.

## Endpoints

### `GET /api/v1/contacts`

List contacts, newest first.

| Query param | Description |
|---|---|
| `email` | Exact match, case-insensitive |
| `external_id` | Exact match (your crosswalk key from a previous CRM) |
| `limit` | Page size (1–100, default 25) |
| `cursor` | Opaque cursor from the previous page |

Contact fields: `id`, `external_id`, `display_name`, `first_name`,
`last_name`, `email`, `phone`, `donor_type`, `billing_address`, `city`,
`state`, `zip`, `mailing_address`, `mailing_city`, `mailing_state`,
`mailing_zip`, `custom_fields` (object keyed by custom-field key),
`qb_customer_id`, `total_lifetime_value`, `last_donation_date`,
`last_donation_amount`, `created_at`.

```bash
curl -H "Authorization: Bearer vk_live_..." \
  "https://app.vantagedonorai.com/api/v1/contacts?email=donor@example.com"
```

### `GET /api/v1/contacts/:id`

Fetch a single contact by Vantage id (the UUID in donor profile URLs).

### `GET /api/v1/donations`

List donations, newest first.

| Query param | Description |
|---|---|
| `donor_id` | Filter to one contact (UUID) |
| `date_from` / `date_to` | Inclusive `YYYY-MM-DD` range on the gift date |
| `limit` / `cursor` | Pagination, as above |

Donation fields: `id`, `donor_id`, `amount`, `date`, `payment_method`,
`category_id`, `campaign_id`, `fund_id`, `memo`, `source`, `qb_id`,
`created_at`.

```bash
curl -H "Authorization: Bearer vk_live_..." \
  "https://app.vantagedonorai.com/api/v1/donations?donor_id=<uuid>&date_from=2026-01-01"
```

## Typical integration: website customer lookup

1. User logs into your site and verifies their email.
2. Your server calls `GET /api/v1/contacts?email=<their email>`.
3. Use the returned `id` to fetch giving history via
   `GET /api/v1/donations?donor_id=<id>`.

Keep your API key server-side — never embed it in client-side code.

## Roadmap

Write endpoints (create/update contacts and donations) are planned; current
keys carry a `read` scope and will keep working unchanged.
