import { config } from "dotenv";
import path from "node:path";

// Integration tests talk to the real (free-tier) Supabase project, using
// the same .env.local a `next dev` run would use.
config({ path: path.resolve(__dirname, "../.env.local") });
