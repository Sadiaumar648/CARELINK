import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { UserRole } from "@carelink/shared";
import { createRequestScopedClient } from "@/lib/db/supabase-server";

export type AuthedRequest = {
  supabase: SupabaseClient;
  userId: string;
  role: UserRole;
};

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthError(401, "Missing or malformed Authorization header");
  }
  return token;
}

/**
 * Validates the caller's Supabase session token and returns a client
 * already scoped to it, plus the caller's id and role — read from
 * public.users, never trusted from the request body or query string.
 * Every protected route handler in app/api should start here.
 *
 * This is task 1.6's "a direct data request for another role's record is
 * refused" made concrete: the role comes from the database row a session
 * token resolves to, not from anything the caller sent.
 */
export async function requireUser(request: Request): Promise<AuthedRequest> {
  const token = extractBearerToken(request);
  const supabase = createRequestScopedClient(token);

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user) {
    throw new AuthError(401, "Invalid or expired session");
  }

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (userErr || !userRow) {
    throw new AuthError(403, "No CareLink account for this session");
  }

  return { supabase, userId: authData.user.id, role: userRow.role as UserRole };
}

/** Narrows requireUser to a specific set of roles, refusing anyone else with 403. */
export async function requireRole(request: Request, allowed: UserRole[]): Promise<AuthedRequest> {
  const authed = await requireUser(request);
  if (!allowed.includes(authed.role)) {
    throw new AuthError(403, `This route requires role: ${allowed.join(" or ")}`);
  }
  return authed;
}

/** Converts an AuthError into the JSON response a route handler should return. */
export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
