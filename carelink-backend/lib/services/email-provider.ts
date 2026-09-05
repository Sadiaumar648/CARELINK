import { Resend } from "resend";

// Provider-agnostic email sending, mirroring the same interface-behind-
// a-factory shape lib/services/payment-provider.ts already established
// for Mobile Money. Real credentials are never hardcoded — everything
// below reads from process.env at call time, and getEmailProvider()
// falls back to a safe, non-delivering stub whenever they're missing or
// EMAIL_PROVIDER isn't set, so a misconfiguration degrades to "logged,
// not sent" rather than crashing anything that calls it.

export type EmailSendResult =
  { status: "sent"; providerMessageId: string } | { status: "failed"; error: string };

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<EmailSendResult>;
}

class LoggingEmailProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<EmailSendResult> {
    // Server-side console only — never returned to a client. Useful in
    // local/dev testing to see exactly what would have gone out and to
    // whom, without any real provider configured.
    console.log(`[email:not-configured] would send to ${to} — "${subject}": ${body}`);
    return {
      status: "failed",
      error: "No email provider configured (EMAIL_PROVIDER environment variable is not set)",
    };
  }
}

// Resend. `from` must be an address on a domain you've verified with
// Resend for real delivery — resend.dev's own onboarding@resend.dev
// works immediately, unverified, for testing.
class ResendEmailProvider implements EmailProvider {
  private client: Resend;
  private from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(to: string, subject: string, body: string): Promise<EmailSendResult> {
    // The EmailProvider interface promises a resolved EmailSendResult,
    // never a rejection — notify.ts's own try/catch would also absorb a
    // throw here, but catching it at the source keeps that contract
    // honest for any other caller.
    try {
      const { data, error } = await this.client.emails.send({
        from: this.from,
        to,
        subject,
        text: body,
      });
      if (error) {
        return { status: "failed", error: error.message };
      }
      if (!data) {
        return { status: "failed", error: "Resend returned no data and no error" };
      }
      return { status: "sent", providerMessageId: data.id };
    } catch (err) {
      return {
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown Resend error",
      };
    }
  }
}

export function getEmailProvider(): EmailProvider {
  if (process.env.EMAIL_PROVIDER === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (apiKey && from) {
      return new ResendEmailProvider(apiKey, from);
    }
    console.error(
      "EMAIL_PROVIDER=resend is set but RESEND_API_KEY/RESEND_FROM_EMAIL are missing — falling back to logging only.",
    );
  }
  // Additional providers get their own branch here, following the exact
  // same shape, if this project ever needs one.
  return new LoggingEmailProvider();
}
