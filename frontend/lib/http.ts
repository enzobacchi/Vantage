import { NextResponse } from "next/server"

/**
 * Safely parse a request body as a JSON object.
 *
 * Returns a discriminated union mirroring `requireUserOrg()`: on failure the
 * caller returns `result.response` (a 400); otherwise `result.body` is a plain
 * object. Guards against malformed JSON and non-object bodies (null, arrays,
 * primitives) that would otherwise throw an uncaught 500 the moment the handler
 * accesses `body.field`.
 */
export async function readJsonObject(
  request: Request
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      ),
    }
  }
  return { ok: true, body: parsed as Record<string, unknown> }
}
