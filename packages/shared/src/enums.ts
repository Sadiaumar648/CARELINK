import { z } from "zod";

// Mirrors the Postgres enum types defined in doc 5 (Backend Schema), §2.
// Kept here so the backend's validation and role-guard middleware and the
// frontend's UI logic read from one definition instead of two.

export const userRoleSchema = z.enum(["parent", "staff", "admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const accountStatusSchema = z.enum(["invited", "active", "suspended"]);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const verificationStatusSchema = z.enum(["unverified", "pending", "verified", "rejected"]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const skillTagSchema = z.enum([
  "infant_care",
  "toddler_care",
  "school_age_supervision",
  "newborn_care",
  "meal_preparation",
  "special_needs_care",
  "light_housekeeping",
]);
export type SkillTag = z.infer<typeof skillTagSchema>;

export const dayPartSchema = z.enum(["morning", "afternoon", "evening", "overnight"]);
export type DayPart = z.infer<typeof dayPartSchema>;
