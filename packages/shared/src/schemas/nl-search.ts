import { z } from "zod";

export const parseSearchQuerySchema = z.object({
  query: z.string().trim().min(1, "Describe who you need").max(500),
});
export type ParseSearchQueryInput = z.infer<typeof parseSearchQuerySchema>;
