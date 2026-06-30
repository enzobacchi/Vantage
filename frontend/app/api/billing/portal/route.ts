/**
 * POST /api/billing/portal
 *
 * Mobile-facing alias of POST /api/stripe/portal — the mobile app opens the
 * returned Stripe Customer Portal URL in an external browser. Billing is
 * managed on the web; mobile never processes payments (App Store compliant).
 */
export { POST } from "../../stripe/portal/route"
