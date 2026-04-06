import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "./admin";

/**
 * Creates a Supabase client for server-side code (Route Handlers, Server Components, Server Actions)
 * that uses the current request's cookies for auth. Use this to get the logged-in user.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore in Server Components / when response is already sent
          }
        },
      },
    }
  );
}

/**
 * Extracts and validates a user from a Bearer token in the Authorization header.
 * Used by mobile clients that cannot use cookie-based auth.
 * Returns the Supabase user object or null if no valid token.
 */
export async function getUserFromBearerToken() {
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user;
}
