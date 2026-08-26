// Task 3.6. A sandbox implementing the real state machine — initiate,
// pending, success, failure — behind the same interface a live Mobile
// Money aggregator would satisfy (doc 2, Technical Design, §7). Stateless
// and deterministic from the payer's phone number, so tests never depend
// on timing or in-memory state that wouldn't survive a serverless
// request boundary anyway.

export type PaymentOutcome = "succeeded" | "pending" | "failed" | "timed_out";
export type MomoNetwork = "mtn" | "telecel" | "airteltigo";

export interface PaymentProvider {
  initiate(input: {
    amount: number;
    network: MomoNetwork;
    payerPhone: string;
    reference: string;
  }): Promise<{ providerReference: string; status: PaymentOutcome }>;
  pollStatus(providerReference: string, payerPhone: string): Promise<PaymentOutcome>;
  refund(providerReference: string, amount: number): Promise<{ refundReference: string }>;
}

// Test numbers, by last digit: ...0 fails immediately, ...1 starts
// pending and resolves to succeeded on the next poll, ...9 stays pending
// forever (simulates a timeout). Anything else succeeds immediately.
function outcomeForPhone(phone: string): PaymentOutcome {
  const last = phone.trim().slice(-1);
  if (last === "0") return "failed";
  if (last === "1") return "pending";
  if (last === "9") return "pending"; // never resolves — see pollStatus
  return "succeeded";
}

export class FakePaymentProvider implements PaymentProvider {
  async initiate(input: {
    amount: number;
    network: MomoNetwork;
    payerPhone: string;
    reference: string;
  }) {
    const providerReference = `SIM-${input.reference}-${Date.now().toString(36)}`;
    return { providerReference, status: outcomeForPhone(input.payerPhone) };
  }

  async pollStatus(_providerReference: string, payerPhone: string): Promise<PaymentOutcome> {
    if (payerPhone.trim().slice(-1) === "9") return "pending"; // permanent-pending test case
    return "succeeded";
  }

  async refund(providerReference: string, _amount: number) {
    return { refundReference: `SIM-REFUND-${providerReference}` };
  }
}

export function getPaymentProvider(): PaymentProvider {
  // A single fake implementation for this phase — the PRD scopes real
  // aggregator integration out entirely (doc 1, §5.2). The interface is
  // deliberately the shape a live provider exposes.
  return new FakePaymentProvider();
}
