import { FakePaymentProvider } from "../lib/services/payment-provider";
import { computeCommissionSplit } from "../lib/services/commission";

describe("FakePaymentProvider (task 3.6)", () => {
  const provider = new FakePaymentProvider();

  it("succeeds immediately for an ordinary phone number", async () => {
    const result = await provider.initiate({
      amount: 5000,
      network: "mtn",
      payerPhone: "+233550001234",
      reference: "CL-TEST01",
    });
    expect(result.status).toBe("succeeded");
    expect(result.providerReference).toMatch(/^SIM-/);
  });

  it("fails immediately for a phone number ending in 0", async () => {
    const result = await provider.initiate({
      amount: 5000,
      network: "mtn",
      payerPhone: "+233550001230",
      reference: "CL-TEST02",
    });
    expect(result.status).toBe("failed");
  });

  it("starts pending and resolves to succeeded on poll for a phone ending in 1", async () => {
    const result = await provider.initiate({
      amount: 5000,
      network: "mtn",
      payerPhone: "+233550001231",
      reference: "CL-TEST03",
    });
    expect(result.status).toBe("pending");

    const polled = await provider.pollStatus(result.providerReference, "+233550001231");
    expect(polled).toBe("succeeded");
  });

  it("a phone ending in 9 stays pending on every poll (timeout simulation)", async () => {
    const result = await provider.initiate({
      amount: 5000,
      network: "mtn",
      payerPhone: "+233550001239",
      reference: "CL-TEST04",
    });
    expect(result.status).toBe("pending");
    expect(await provider.pollStatus(result.providerReference, "+233550001239")).toBe("pending");
    expect(await provider.pollStatus(result.providerReference, "+233550001239")).toBe("pending");
  });

  it("refund returns a distinct reference", async () => {
    const { refundReference } = await provider.refund("SIM-abc", 5000);
    expect(refundReference).toContain("SIM-REFUND-");
  });
});

describe("computeCommissionSplit (task 3.9)", () => {
  it("splits an even amount exactly", () => {
    expect(computeCommissionSplit(10000, 0.15)).toEqual({
      commissionAmount: 1500,
      payoutAmount: 8500,
    });
  });

  it("always sums exactly to the amount, even with rounding", () => {
    for (const amount of [101, 999, 1001, 33333, 7]) {
      const { commissionAmount, payoutAmount } = computeCommissionSplit(amount, 0.15);
      expect(commissionAmount + payoutAmount).toBe(amount);
    }
  });

  it("zero commission rate pays out the full amount", () => {
    expect(computeCommissionSplit(5000, 0)).toEqual({ commissionAmount: 0, payoutAmount: 5000 });
  });
});
