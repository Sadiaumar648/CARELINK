// A tiny, disposable bridge between /register and /onboarding/identity.
//
// A parent gives their Ghana Card number and a live photo during
// registration, but the real, authenticated verification submission
// (POST /api/verification/submissions) can only happen once they have a
// session — which signUp() does not return while email confirmation is
// required (the live default for this project). Rather than fabricate a
// submission or silently drop what they already typed, this stashes it in
// sessionStorage so /onboarding/identity's existing wizard can pre-fill it
// once they're actually signed in — never anything the real verification
// decision itself relies on, and read-once: the consuming page clears the
// key immediately after reading it.
export const PENDING_VERIFICATION_KEY = "carelink:pending-verification";

export type PendingVerification = {
  idDocumentNumber: string;
  livePhotoDataUrl: string;
  livePhotoName: string;
  livePhotoType: string;
};

/** Reads and clears the stashed data, tolerating anything malformed or missing. */
export function readAndClearPendingVerification(): PendingVerification | null {
  try {
    const raw = sessionStorage.getItem(PENDING_VERIFICATION_KEY);
    sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.idDocumentNumber === "string" &&
      typeof parsed?.livePhotoDataUrl === "string" &&
      typeof parsed?.livePhotoName === "string" &&
      typeof parsed?.livePhotoType === "string"
    ) {
      return parsed as PendingVerification;
    }
    return null;
  } catch {
    return null;
  }
}

/** Converts the stashed data URL back into a real File for the upload form. */
export function pendingVerificationToFile(pending: PendingVerification): File {
  const [, base64] = pending.livePhotoDataUrl.split(",");
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], pending.livePhotoName, { type: pending.livePhotoType });
}
