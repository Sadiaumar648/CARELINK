import { getSupabaseClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  // An optional machine-readable code from the response body (e.g.
  // "nanny_unavailable"), when a route sends one alongside `error`.
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type ApiFetchOptions = Omit<RequestInit, "body"> & { body?: unknown };

// Every screen talks to carelink-backend through this — never to Supabase's
// Postgres/Storage directly (the one exception is auth, see
// lib/supabase/client.ts). Attaches the current session as a bearer token
// on every call, so the backend's RLS-scoped client sees the same caller
// the frontend is signed in as.
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const isFormData = body instanceof FormData;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(await authHeader()),
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const message = obj && typeof obj.error === "string" ? obj.error : res.statusText;
    const code = obj && typeof obj.code === "string" ? obj.code : undefined;
    throw new ApiError(res.status, message, code);
  }
  return data as T;
}
