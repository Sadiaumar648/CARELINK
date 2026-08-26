import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * A client scoped to the caller's own Supabase session token, so every
 * query it runs is subject to the row-level security policies from
 * migration 0001 exactly as if the caller had queried Postgres directly.
 * This is how carelink-backend stays "the database enforces the rules"
 * (doc 2, Technical Design, principle 2) despite living in a separate app
 * from carelink-frontend — see the build plan §4.
 */
export function createRequestScopedClient(accessToken: string): SupabaseClient {
  const url = requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Bypasses row-level security entirely. Reserved for the handful of
 * operations RLS cannot express by design — e.g. writing an invitation
 * code hash onto a roster record before the invited person has an account
 * to own it. Never used to serve a client request directly: every call
 * site must independently check the caller's role before reaching for
 * this client.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = requireEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
