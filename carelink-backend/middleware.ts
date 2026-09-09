import { NextResponse, type NextRequest } from "next/server";

// Security review finding: ALLOWED_ORIGIN was defined in .env.local but
// never wired into anything, so every route ran with no CORS
// restriction at all. Comma-separate multiple origins as the project
// grows (e.g. the frontend's local dev port and its deployed domain).
// This only adds headers for browser callers — it never blocks a
// request outright, since auth here is a Bearer token, not a cookie, so
// a disallowed origin can't silently ride along; the browser's own
// same-origin policy is what actually keeps it from reading the
// response without an Access-Control-Allow-Origin match.
const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : undefined;

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: allowOrigin ? corsHeaders(allowOrigin) : {},
    });
  }

  const response = NextResponse.next();
  if (allowOrigin) {
    for (const [key, value] of Object.entries(corsHeaders(allowOrigin))) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
