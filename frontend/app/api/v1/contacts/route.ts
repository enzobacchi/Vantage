/**
 * GET /api/v1/contacts — deprecated alias for GET /api/v1/donors.
 *
 * Kept for backwards compatibility; new integrations should use
 * /api/v1/donors. Same auth, params, and response shape.
 */
export { GET } from "../donors/route"
