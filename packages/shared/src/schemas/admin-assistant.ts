import { z } from "zod";

// The admin's read-only Q&A assistant (lib/services/admin-assistant.ts
// on the backend) — stateless, same shape as careAssistantMessageSchema
// (care-request.ts): the client sends the full visible transcript each
// turn, no draft/state carried server-side between requests.
export const adminAssistantMessageSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(40),
});

export type AdminAssistantMessageInput = z.infer<typeof adminAssistantMessageSchema>;
