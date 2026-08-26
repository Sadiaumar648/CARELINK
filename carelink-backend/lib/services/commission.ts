// Task 3.9. Pure so the rounding behaviour at odd amounts is directly
// unit-testable — commission and payout must always sum exactly to the
// amount paid, to the pesewa.
export function computeCommissionSplit(
  amount: number,
  commissionRate: number,
): { commissionAmount: number; payoutAmount: number } {
  const commissionAmount = Math.round(amount * commissionRate);
  const payoutAmount = amount - commissionAmount;
  return { commissionAmount, payoutAmount };
}
