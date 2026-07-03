/**
 * GET /api/v1/contacts/:id — deprecated alias for GET /api/v1/donors/:id.
 *
 * Kept for backwards compatibility; new integrations should use
 * /api/v1/donors/:id. Same auth, params, and response shape.
 */
export { GET } from "../../donors/[id]/route"
