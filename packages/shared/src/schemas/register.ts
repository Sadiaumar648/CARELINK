import { z } from "zod";

export const registerParentSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name"),
  phone: z.string().trim().min(1, "Enter your phone number"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});

export type RegisterParentInput = z.infer<typeof registerParentSchema>;
