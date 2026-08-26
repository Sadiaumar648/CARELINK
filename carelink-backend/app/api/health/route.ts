import { NextResponse } from "next/server";
import { userRoleSchema } from "@carelink/shared";

// Confirms two things at once: the API routing works, and the workspace
// wiring to packages/shared resolves — this is the smoke test from the
// build plan's "Do today" checklist, step 6, run early.
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "carelink-backend",
    knownRoles: userRoleSchema.options,
  });
}
