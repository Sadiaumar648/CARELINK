import { z } from "zod";

export const momoNetworkSchema = z.enum(["mtn", "telecel", "airteltigo"]);
export type MomoNetwork = z.infer<typeof momoNetworkSchema>;

// Task 3.7. The amount is never accepted from the client — it's derived
// server-side from the booking's locked total (doc 5 §4.10).
export const initiatePaymentSchema = z.object({
  network: momoNetworkSchema,
  payerPhone: z.string().trim().min(1, "Enter the paying phone number"),
});
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;

export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(1, "Enter a reason for cancelling"),
});
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
