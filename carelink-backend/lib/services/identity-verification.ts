// Academic simulation of a Ghana Card identity check through the
// National Identification Authority's Identity Verification Services
// Platform (NIA/IVSP) — CareLink has no institutional relationship with
// NIA and makes no external request of any kind here. Everything below
// is deterministic, local, and fictional, built the same way
// payment-provider.ts's FakePaymentProvider already simulates Mobile
// Money: a real interface a genuine integration would satisfy, behind a
// fake implementation this phase intentionally scopes real access out of.
//
// Production deployment would replace MockNIAProvider with an
// authorized NIA Identity Verification Services integration after
// institutional onboarding, approval, technical setup, and contractual
// requirements with NIA — none of which CareLink currently has. Nothing
// in this module, or any route that calls it, should ever be read as
// claiming a live NIA connection exists.
export type NIAFailureReason = "pin_mismatch" | "biometric_mismatch" | "incomplete";

export type NIAVerificationResult = {
  status: "verified" | "failed";
  provider: "mock_nia_ivsp";
  pinMatch: boolean;
  biodataMatch: boolean;
  biometricMatch: boolean;
  verifiedName: string | null;
  verifiedDateOfBirth: string | null;
  verificationReference: string;
  failureReason: NIAFailureReason | null;
};

export interface IdentityVerificationProvider {
  verify(input: {
    ghanaCardPin: string;
    dateOfBirth: string;
    fullName: string;
  }): Promise<NIAVerificationResult>;
}

// A well-formed (but never real) Ghana Card PIN: GHA-XXXXXXXXX-X. The
// simulation never inspects or stores the actual digits beyond this
// shape check — there is no real NIA database behind it to look
// anything up in, so "matching" a real card number would be dishonest
// even in a demo. Malformed input fails immediately, exactly like a
// genuine lookup would reject something that isn't shaped like a card
// number at all.
const PIN_PATTERN = /^GHA-\d{9}-(\d)$/i;

function randomReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `DEMO-${out}`;
}

// Test-number-style determinism, the same convention
// payment-provider.ts's outcomeForPhone already established in this
// codebase: the PIN's own final digit picks the demo outcome, so a
// presenter can reliably show every state without a hidden developer
// panel. Ending in 0 simulates "no matching record" (PIN mismatch);
// ending in 1 simulates a record found but the live photo not matching
// it (biometric mismatch); anything else (a well-formed PIN with any
// other final digit) simulates success.
export class MockNIAProvider implements IdentityVerificationProvider {
  async verify(input: {
    ghanaCardPin: string;
    dateOfBirth: string;
    fullName: string;
  }): Promise<NIAVerificationResult> {
    const reference = randomReference();
    const match = input.ghanaCardPin.trim().match(PIN_PATTERN);

    if (!input.dateOfBirth || !input.fullName.trim()) {
      return {
        status: "failed",
        provider: "mock_nia_ivsp",
        pinMatch: false,
        biodataMatch: false,
        biometricMatch: false,
        verifiedName: null,
        verifiedDateOfBirth: null,
        verificationReference: reference,
        failureReason: "incomplete",
      };
    }

    if (!match) {
      return {
        status: "failed",
        provider: "mock_nia_ivsp",
        pinMatch: false,
        biodataMatch: false,
        biometricMatch: false,
        verifiedName: null,
        verifiedDateOfBirth: null,
        verificationReference: reference,
        failureReason: "pin_mismatch",
      };
    }

    const lastDigit = match[1];
    if (lastDigit === "0") {
      return {
        status: "failed",
        provider: "mock_nia_ivsp",
        pinMatch: false,
        biodataMatch: false,
        biometricMatch: false,
        verifiedName: null,
        verifiedDateOfBirth: null,
        verificationReference: reference,
        failureReason: "pin_mismatch",
      };
    }

    if (lastDigit === "1") {
      return {
        status: "failed",
        provider: "mock_nia_ivsp",
        pinMatch: true,
        biodataMatch: true,
        biometricMatch: false,
        verifiedName: input.fullName,
        verifiedDateOfBirth: input.dateOfBirth,
        verificationReference: reference,
        failureReason: "biometric_mismatch",
      };
    }

    return {
      status: "verified",
      provider: "mock_nia_ivsp",
      pinMatch: true,
      biodataMatch: true,
      biometricMatch: true,
      verifiedName: input.fullName,
      verifiedDateOfBirth: input.dateOfBirth,
      verificationReference: reference,
      failureReason: null,
    };
  }
}

// The one seam a real integration would replace — every call site below
// goes through this, never MockNIAProvider directly, so swapping in an
// authorized NIA/IVSP client later is a one-line change here, not a
// rewrite of the parent verification flow.
export interface IdentityVerificationService {
  verifyIdentity(input: {
    ghanaCardPin: string;
    dateOfBirth: string;
    fullName: string;
  }): Promise<NIAVerificationResult>;
}

class DefaultIdentityVerificationService implements IdentityVerificationService {
  constructor(private readonly provider: IdentityVerificationProvider) {}

  verifyIdentity(input: {
    ghanaCardPin: string;
    dateOfBirth: string;
    fullName: string;
  }): Promise<NIAVerificationResult> {
    return this.provider.verify(input);
  }
}

export function getIdentityVerificationService(): IdentityVerificationService {
  // A single mock implementation for this phase — real NIA/IVSP access
  // is out of scope (see the module comment above). The interface is
  // deliberately shaped the way a live provider integration would be.
  return new DefaultIdentityVerificationService(new MockNIAProvider());
}
