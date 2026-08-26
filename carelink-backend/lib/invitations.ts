import { createHash, randomBytes } from "node:crypto";

// Excludes 0/O and 1/I — easy to read aloud over a phone call, which is
// literally how this code reaches a caregiver (doc 3, App Flow, §2.1).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInvitationCode(length = 8): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export function hashInvitationCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase().trim()).digest("hex");
}

// Supabase Auth's phone+password sign-in path needs an SMS provider
// configured even when no OTP is ever sent, which is a real-money
// dependency this project doesn't need. The caregiver claim flow is still
// exactly "code, phone, password" as designed (doc 3, App Flow, §2.3) —
// this placeholder email is an internal auth identifier only, never shown
// to the caregiver and never used by them to sign in.
export function placeholderStaffEmail(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `staff+${digits}-${randomBytes(4).toString("hex")}@carelink.invite`;
}
