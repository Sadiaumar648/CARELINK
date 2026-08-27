import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The frontend's one exception to "talk only to the backend": it signs in
// directly with Supabase Auth, then forwards the session token to
// carelink-backend on every API call (see lib/api/client.ts). This client
// never queries Postgres directly — only auth.
let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  client = createClient(url, anonKey);
  return client;
}
