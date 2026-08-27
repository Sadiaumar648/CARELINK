// Errors explain what went wrong and how to fix it — no raw stack traces,
// no "Unexpected error" left to speak for itself.
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}
