"use client";

import { useRef, useState } from "react";
import { CheckCircle, MapPin } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";

// CareLink's finalized location system: a parent (or, reused as-is,
// a caregiver setting their base location — see Phase 3) picks
// EXACTLY where care happens, resolved to a real map point through
// CareLink's geocoding service — never a vague typed area name. Raw
// coordinates are captured and returned to the caller via onChange,
// but never rendered here; only a human-readable address ever reaches
// the screen (Part 1/12's explicit rule).
export type ResolvedLocation = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
  // The coarse suburb/neighbourhood Nominatim's own address breakdown
  // returns — the caller may use this to keep existing area-string
  // matching working; never displayed on its own.
  coarseArea: string | null;
  source: "current_location" | "gps_address";
};

type GeocodeApiResult = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
  coarseArea: string | null;
} | null;

type Phase = "prompt" | "locating" | "address-entry" | "resolving";

export function LocationPicker({
  value,
  onChange,
  initialQuery,
  description = "We need the exact location where your caregiver will provide care.",
  helperText = "Your location is used to find nearby available caregivers.",
  addressPlaceholder = "Enter the GPS address where care will take place",
  confirmedLabel = "Care location confirmed",
  // "buttons" (default) is the original, unchanged presentation — two
  // independent action buttons — still used as-is by the caregiver
  // base-location picker (staff-profile-setup.tsx). "radio" is the
  // Parent Request Care page's finalized mutually-exclusive selection
  // pattern: exactly one of two selectable options, never both active.
  // Both layouts share every bit of underlying state/logic below —
  // only the JSX for the not-yet-resolved state differs.
  layout = "buttons",
}: {
  value: ResolvedLocation | null;
  onChange: (value: ResolvedLocation | null) => void;
  // A location name mentioned earlier (e.g. in a CareLink AI
  // conversation) — a starting point for the address search, never
  // treated as already resolved. Opens straight into address-entry
  // mode, pre-filled, so the parent only has to confirm it.
  initialQuery?: string;
  // All three default to the parent/service-location framing (this
  // component's original context); the caregiver base-location reuse
  // (staff-profile-setup.tsx) overrides them, since "your caregiver
  // will provide care" makes no sense read back at a caregiver about
  // their own base location.
  description?: string;
  helperText?: string;
  addressPlaceholder?: string;
  confirmedLabel?: string;
  layout?: "buttons" | "radio";
}) {
  const [phase, setPhase] = useState<Phase>(initialQuery ? "address-entry" : "prompt");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [error, setError] = useState<string | null>(null);
  // Bumped every time a method is (re-)selected — an async callback
  // (geolocation's own success/error, or a forward-geocode response)
  // that isn't for the current attempt any more is simply ignored, so
  // switching methods mid-request can never let a stale result land
  // and silently overwrite what the parent actually chose next. This
  // is what makes "never submit two competing locations" actually true
  // even across a real network/permission-prompt race, not just true
  // by the single-value data model alone.
  const requestIdRef = useRef(0);

  function captureCurrentLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError("Your device doesn't support location access. Try entering your address instead.");
      return;
    }
    setPhase("locating");
    const myRequest = ++requestIdRef.current;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (myRequest !== requestIdRef.current) return;
        const { latitude, longitude } = position.coords;
        apiFetch<{ result: GeocodeApiResult }>("/api/geocoding/reverse", {
          method: "POST",
          body: { latitude, longitude },
        })
          .then((res) => {
            if (myRequest !== requestIdRef.current) return;
            // The real GPS fix is already in hand regardless of whether
            // the geocoder could turn it into a pretty address — a
            // parent is never blocked just because reverse-geocoding
            // failed, and nothing here ever falls back to a fake or
            // approximated coordinate.
            onChange({
              formattedAddress: res.result?.formattedAddress ?? "Your current location",
              latitude,
              longitude,
              placeId: res.result?.placeId ?? null,
              coarseArea: res.result?.coarseArea ?? null,
              source: "current_location",
            });
            setPhase("prompt");
          })
          .catch((err) => {
            if (myRequest !== requestIdRef.current) return;
            setError(errorMessage(err));
            setPhase("prompt");
          });
      },
      (err) => {
        if (myRequest !== requestIdRef.current) return;
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. You can allow it in your browser's site settings, or enter your address instead."
            : "We couldn't get your location right now. Try again, or enter your address instead.",
        );
        setPhase("prompt");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  function confirmAddress() {
    const trimmed = query.trim();
    if (!trimmed) return;
    setError(null);
    setPhase("resolving");
    const myRequest = ++requestIdRef.current;
    apiFetch<{ result: GeocodeApiResult }>("/api/geocoding/search", {
      method: "POST",
      body: { query: trimmed },
    })
      .then((res) => {
        if (myRequest !== requestIdRef.current) return;
        if (!res.result) {
          setError(
            "We couldn't find that exact address. Try adding more detail — street name, area, and city.",
          );
          setPhase("address-entry");
          return;
        }
        onChange({
          formattedAddress: res.result.formattedAddress,
          latitude: res.result.latitude,
          longitude: res.result.longitude,
          placeId: res.result.placeId,
          coarseArea: res.result.coarseArea,
          source: "gps_address",
        });
        setPhase("prompt");
      })
      .catch((err) => {
        if (myRequest !== requestIdRef.current) return;
        setError(errorMessage(err));
        setPhase("address-entry");
      });
  }

  function changeLocation() {
    onChange(null);
    requestIdRef.current += 1;
    setQuery("");
    setError(null);
    setPhase("prompt");
  }

  // Selecting a method invalidates whatever the other method was doing
  // (a permission prompt still pending, a stale error) — a clean
  // restart, never a leftover from the method just left behind.
  function selectCurrentLocationMethod() {
    requestIdRef.current += 1;
    setQuery("");
    setError(null);
    captureCurrentLocation();
  }

  function selectAddressMethod() {
    requestIdRef.current += 1;
    setError(null);
    setPhase("address-entry");
  }

  if (value) {
    // Which radio should read as selected in the confirmed state is
    // exactly what actually produced this value — never separate,
    // driftable state.
    const isCurrentLocation = value.source === "current_location";
    return (
      <div className="flex flex-col gap-2 rounded-[12px] border border-[var(--color-lavender-border)] bg-wisteria-tint p-3.5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-wisteria-pressed">
          <CheckCircle size={16} weight="fill" />{" "}
          {isCurrentLocation ? "Location detected" : confirmedLabel}
        </p>
        <p className="text-[14px] text-ink">{value.formattedAddress}</p>
        <button
          type="button"
          onClick={changeLocation}
          className="self-start text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
        >
          Change location
        </button>
      </div>
    );
  }

  const busy = phase === "locating" || phase === "resolving";

  if (layout === "radio") {
    // Exactly one selectable method at a time — never two independent
    // buttons that could both look "active". Derived purely from phase
    // (no separate "which radio is picked" state to drift out of sync
    // with what's actually happening): 'locating' only ever follows
    // choosing current-location; 'address-entry'/'resolving' only ever
    // follow choosing the address method.
    const selected: "current" | "address" | null =
      phase === "locating"
        ? "current"
        : phase === "address-entry" || phase === "resolving"
          ? "address"
          : null;

    return (
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink-muted">{description}</p>

        <div className="flex flex-col gap-2">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-3.5 py-3 text-[14px] text-ink transition-colors ${
              selected === "current"
                ? "border-wisteria bg-wisteria-tint"
                : "border-[var(--color-lavender-border)] hover:border-wisteria/50"
            }`}
          >
            <input
              type="radio"
              name="location-method"
              checked={selected === "current"}
              onChange={selectCurrentLocationMethod}
              className="h-4 w-4 accent-wisteria"
            />
            <MapPin size={16} weight="fill" className="text-wisteria" />
            {phase === "locating" ? "Getting your location…" : "Use my current location"}
          </label>

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-3.5 py-3 text-[14px] text-ink transition-colors ${
              selected === "address"
                ? "border-wisteria bg-wisteria-tint"
                : "border-[var(--color-lavender-border)] hover:border-wisteria/50"
            }`}
          >
            <input
              type="radio"
              name="location-method"
              checked={selected === "address"}
              onChange={selectAddressMethod}
              className="h-4 w-4 accent-wisteria"
            />
            Enter a GPS address
          </label>

          {selected === "address" && (
            <div className="ml-7 flex flex-col gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={addressPlaceholder}
                disabled={phase === "resolving"}
                className="w-full rounded-[10px] border border-[var(--color-lavender-border)] bg-sheet px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
              />
              <Button
                type="button"
                onClick={confirmAddress}
                disabled={phase === "resolving" || !query.trim()}
                className="self-start"
              >
                {phase === "resolving" ? "Confirming…" : "Confirm location"}
              </Button>
            </div>
          )}
        </div>

        {error && <p className="text-[13px] text-error">{error}</p>}
        <p className="text-[11.5px] text-ink-muted">{helperText}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-ink-muted">{description}</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={captureCurrentLocation} disabled={busy}>
          <MapPin size={16} weight="fill" />
          {phase === "locating" ? "Getting your location…" : "Use my current location"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPhase("address-entry")}
          disabled={busy}
        >
          Enter GPS address
        </Button>
      </div>

      {(phase === "address-entry" || phase === "resolving") && (
        <div className="flex flex-col gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={addressPlaceholder}
            disabled={phase === "resolving"}
            className="w-full rounded-[10px] border border-[var(--color-lavender-border)] bg-sheet px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
          />
          <Button
            type="button"
            onClick={confirmAddress}
            disabled={phase === "resolving" || !query.trim()}
            className="self-start"
          >
            {phase === "resolving" ? "Confirming…" : "Confirm location"}
          </Button>
        </div>
      )}

      {error && <p className="text-[13px] text-error">{error}</p>}

      <p className="text-[11.5px] text-ink-muted">{helperText}</p>
    </div>
  );
}
