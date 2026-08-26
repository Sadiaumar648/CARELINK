import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/db/supabase-server";

// Live integration test for tasks 4.2 and 4.4 — deliberately minimal (one
// real call each) since these hit the real Anthropic API. The pure
// parsing/sanitizing logic already has full unit coverage in
// tests/ai-parsing.test.ts; this file exists only to prove the wiring
// (env var, SDK call, response shape, DB write) actually works.

const BASE_URL = process.env.CARELINK_API_URL ?? "http://localhost:3000";
const TEST_PASSWORD = "Test-Password-123!";

const admin = createServiceRoleClient();
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
);

function randomPhone() {
  return `+23355${Math.floor(1000000 + Math.random() * 8999999)}`;
}

async function signIn(email: string) {
  const { data } = await anon.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  return data!.session!.access_token;
}

describe("AI features, live (tasks 4.2, 4.4)", () => {
  it("parses a plain-language search into structured filters", async () => {
    const email = `carelink-test-ai-parent-${Date.now()}@example.com`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "parent", full_name: "AI Test Parent", phone: randomPhone() },
    });
    const token = await signIn(email);

    const res = await fetch(`${BASE_URL}/api/search/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query:
          "someone in Tema for two afternoons a week, good with toddlers, under 25 cedis an hour",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filters).not.toBeNull();
    expect(body.filters.area?.toLowerCase()).toContain("tema");
    expect(body.filters.skills).toContain("toddler_care");
    expect(body.filters.budgetCeiling).toBeLessThanOrEqual(25);

    await admin.auth.admin.deleteUser(data!.user!.id);
  }, 30000);

  it("returns a real plausibility verdict on a verification submission with a live photo", async () => {
    const email = `carelink-test-ai-verify-${Date.now()}@example.com`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "parent", full_name: "AI Test Verify", phone: randomPhone() },
    });
    const token = await signIn(email);

    // A degenerate/simply-encoded image gets a real "could not process
    // image" error from the API rather than exercising the code path
    // under test — this is a small but properly-encoded JPEG. The
    // assertion only checks that a verdict came back, not what it is.
    const testJpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAQCAwMDAgQDAwMEBAQEBQkGBQUFBQsICAYJDQsNDQ0LDAwOEBQRDg8TDwwMEhgSExUWFxcXDhEZGxkWGhQWFxb/2wBDAQQEBAUFBQoGBgoWDwwPFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhb/wAARCAEsASwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6mooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiig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AeH/APDH/wCzp/0Tz/yt6h/8fr1vwP4a0Hwd4TsfDPhnS4NN0nTYRFa2sAO1FySSSclmJJZmYlmYliSSTWrRWkqtSatKTZEacIu8YpBRRRWZYUUUUAY91/x8yf75/nUdSXX/AB8yf75/nUdfV0/gXofL1PjYUUUVZIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFXtF/5afh/WqNXNHYiZ07Fc/l/wDrrlxyvh5f11OrBu1eP9dDQooor5s+gCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAx7r/AI+ZP98/zqOlkYvIznqxyaSvrIK0Uj5eTvJsKKKKokKKKKACiiigAooooAKKKKACiiigAooooAKKKKACptPbbeJk4B4qGgEg5BwR0NRUhzwce5dOXJNS7G5RSRsHjVx0YZFLXyjVnY+nTugooooAKKKKACiiigAooooAKKKKACiiigAooooAKjum2WztnHynB96kqprD4hVOfmP6D/IrbDw560YmOInyUpSM6iiivqD5sKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA0dJkzCYyeVOR9Kt1j2sphmV+3ceorYBBGQcg9DXgZhR5KvMtme5ga3PS5XugooorgO4KKKKACiiigAooooAKKKKACiiigAooooAKyb+TzbpiDlRwKv6hN5VucH5m4H+NZVexllHeo/RHlZjW2poKKKK9Y8oKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAK0NKn3L5LtyPu59PSs+lVirBh1ByKwxFFVqbizbD1nSmpI26Khs7hZ09HHUf1FTV83UpypycZLU+ihOM4qUXoFFFFQUFFFFABRRRQAUUUUAFFFFABRRRQAUSAMk4A6mis/UboPmKP7v8AEfX6Vvh6Eq0+VGNevGjDmZDezGaYnPyjhRUNFFfSwgoRUY7I+dnNzk5PdhRRRVEhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQA+GR4pA6Hn+dadncLOno46j+orJpVZlbKkg+oNcuJwsK67PudWHxUqL8uxt0VStb4H5Z+P8AaA/nV0EEZByD0NeDWoVKTtNHt0q0KqvFhRRRWJqFFFFABRRRQAUVHcTRwrlzj0Hc1n3d28uVX5U9B1P1rqw+EqVnpou5zV8VTorXfsTXt6cmOE8dC3+FUaKK96jRhRjyxR4datOrK8mFFFFbGQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAU+GWSJsxsVplFKUVJWa0GpNO6LseoNn95GCP8AZ4qZL6BupZfqP8KzKK455fQl0t6HXDHV49bmr9stv+en/jpo+2W3/PT/AMdNZVFZ/wBmUe7/AA/yNP7Srdl/XzNGTUIhnarMe3YGq819M4IXCD261WorangqEPs39TGeMrT629AJJOSck9TRRRXWcoUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH//Z",
      "base64",
    );

    const form = new FormData();
    form.set("idDocumentType", "ghana_card");
    form.set("idDocumentNumber", "GHA-AI-TEST-1");
    form.set("referenceName", "Ref");
    form.set("referencePhone", randomPhone());
    form.set("consentPhoto", "true");
    form.set("idDocumentFile", new Blob([testJpeg], { type: "image/jpeg" }), "id.jpg");
    form.set("selfieFile", new Blob([testJpeg], { type: "image/jpeg" }), "selfie.jpg");

    const res = await fetch(`${BASE_URL}/api/verification/submissions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(["likely_match", "uncertain", "likely_mismatch"]).toContain(
      body.submission.photo_verdict,
    );
    expect(body.submission.photo_rationale).toBeTruthy();
    expect(body.submission.photo_model_version).toBe("claude-opus-5");

    await admin.auth.admin.deleteUser(data!.user!.id);
  }, 30000);
});
