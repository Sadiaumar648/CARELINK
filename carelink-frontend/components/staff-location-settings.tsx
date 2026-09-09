"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, MapPin, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { minutesAgoLabel } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { LocationPicker, type ResolvedLocation } from "@/components/location-picker";
import { patchProfile, useOwnProfile } from "@/components/staff-profile-setup";

// A caregiver's real reason to change these: they moved. Previously
// base location/service area were only ever set once, during
// onboarding (app/onboarding/caregiver/page.tsx) — this is that same
// LocationPicker/staff_areas machinery, reused here so it can be
// updated any time afterward too, not just at signup. "Location
// Sharing" (live GPS on/off) lives here as well now, moved from Home —
// same exact mechanism as before (real GPS, only ever requested on an
// explicit tap, never silently), just relocated next to the other two
// location-related controls instead of sitting on the dashboard.

const MAX_SERVICE_AREAS = 3;
const LOCATION_REFRESH_INTERVAL_MS = 4 * 60 * 1000;

type DispatchStatus = { available: boolean; updatedAt: string | null };

function LocationSharingSubsection() {
  const [status, setStatus] = useState<DispatchStatus | null>(null);
  const [actionInProgress, setActionInProgress] = useState<"on" | "off" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch<DispatchStatus>("/api/staff/dispatch-status")
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  function stopRefreshing() {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
  }

  function captureAndSend(onDone: (result: DispatchStatus | null) => void) {
    if (!navigator.geolocation) {
      onDone(null);
      setError("Your device doesn't support location access.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        apiFetch<{ available: boolean }>("/api/staff/dispatch-status", {
          method: "POST",
          body: {
            available: true,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        })
          .then(() => onDone({ available: true, updatedAt: new Date().toISOString() }))
          .catch((err) => {
            setError(errorMessage(err));
            onDone(null);
          });
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Enable location for this site in your browser settings to turn sharing on."
            : "We couldn't get your location right now. Try again in a moment.",
        );
        onDone(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  function turnOn() {
    setError(null);
    setActionInProgress("on");
    captureAndSend((result) => {
      setActionInProgress(null);
      if (!result) return;
      setStatus(result);
      stopRefreshing();
      refreshTimer.current = setInterval(() => {
        captureAndSend((refreshed) => {
          if (refreshed) setStatus(refreshed);
        });
      }, LOCATION_REFRESH_INTERVAL_MS);
    });
  }

  function turnOff() {
    setError(null);
    setActionInProgress("off");
    stopRefreshing();
    apiFetch<{ available: boolean }>("/api/staff/dispatch-status", {
      method: "POST",
      body: { available: false },
    })
      .then(() => setStatus({ available: false, updatedAt: null }))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setActionInProgress(null));
  }

  useEffect(() => stopRefreshing, []);

  if (!status) return <p className="text-[13px] text-ink-muted">Loading…</p>;
  const busy = actionInProgress !== null;

  return (
    <Sheet className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin size={16} className={status.available ? "text-wisteria" : "text-ink-muted"} />
          <p className="text-[13px] font-semibold text-ink">
            Location Sharing · {status.available ? "On" : "Off"}
          </p>
        </div>
        <Button
          size="default"
          variant="secondary"
          onClick={status.available ? turnOff : turnOn}
          disabled={busy}
        >
          {actionInProgress === "on"
            ? "Turning on…"
            : busy
              ? "Updating…"
              : status.available
                ? "Turn off"
                : "Turn on"}
        </Button>
      </div>
      <p className="text-[12px] leading-relaxed text-ink-muted">
        Your location helps CareLink find nearby care requests.
      </p>
      {status.available && status.updatedAt && (
        <p className="text-[11.5px] text-ink-muted">
          Last updated {minutesAgoLabel(status.updatedAt)}
        </p>
      )}
      {error && <p className="text-[12px] text-error">{error}</p>}
    </Sheet>
  );
}

function BaseLocationSubsection() {
  const { profile, setProfile, error: loadError } = useOwnProfile();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLocationChange(value: ResolvedLocation | null) {
    if (!profile || !value) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchProfile(profile, {
        base_address: value.formattedAddress,
        base_latitude: value.latitude,
        base_longitude: value.longitude,
        base_place_id: value.placeId,
      });
      setProfile(updated);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p className="text-[13px] text-error">{loadError}</p>;
  if (!profile) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  const currentLocation: ResolvedLocation | null =
    profile.base_address && profile.base_latitude != null && profile.base_longitude != null
      ? {
          formattedAddress: profile.base_address,
          latitude: profile.base_latitude,
          longitude: profile.base_longitude,
          placeId: profile.base_place_id,
          coarseArea: null,
          source: "gps_address",
        }
      : null;

  if (editing || !currentLocation) {
    return (
      <Sheet className="flex flex-col gap-3">
        <LocationPicker
          value={null}
          onChange={(v) => void onLocationChange(v)}
          description="Set the base location you provide care from."
          helperText="Parents nearby will be able to find and book you based on this location."
          addressPlaceholder="Enter your GPS address"
          confirmedLabel="Base location confirmed"
        />
        {saving && <p className="text-[12.5px] text-ink-muted">Saving…</p>}
        {error && <p className="text-[13px] text-error">{error}</p>}
        {currentLocation && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="self-start text-[12.5px] font-semibold text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-wisteria-pressed">
            <CheckCircle size={16} weight="fill" /> Base location
          </p>
          <p className="text-[14px] text-ink">{currentLocation.formattedAddress}</p>
        </div>
        <Button variant="secondary" onClick={() => setEditing(true)}>
          <PencilSimple size={15} /> Change
        </Button>
      </div>
      {error && <p className="text-[13px] text-error">{error}</p>}
    </Sheet>
  );
}

type AreaRow = { area: string; isPrimary: boolean };

function ServiceAreasSubsection() {
  const [areas, setAreas] = useState<AreaRow[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ areas: AreaRow[] }>("/api/staff/areas")
      .then((res) => setAreas(res.areas))
      .catch(() => setAreas([]));
  }, []);

  function startEditing() {
    setDraft(areas && areas.length > 0 ? areas.map((a) => a.area) : [""]);
    setError(null);
    setEditing(true);
  }

  function updateDraft(i: number, value: string) {
    setDraft((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  }

  function addDraftRow() {
    setDraft((prev) => (prev.length < MAX_SERVICE_AREAS ? [...prev, ""] : prev));
  }

  function removeDraftRow(i: number) {
    setDraft((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function save() {
    const cleaned = draft.map((a) => a.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      setError("Add at least one service area.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ areas: AreaRow[] }>("/api/staff/areas", {
        method: "PUT",
        body: { areas: cleaned.map((area, i) => ({ area, isPrimary: i === 0 })) },
      });
      setAreas(res.areas);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (areas === null) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  if (editing) {
    return (
      <Sheet className="flex flex-col gap-3">
        <div className="flex flex-col gap-3">
          {draft.map((area, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Field
                  id={`edit-service-area-${i}`}
                  label={i === 0 ? "Primary area" : `Area ${i + 1}`}
                  placeholder="East Legon"
                  value={area}
                  onChange={(e) => updateDraft(i, e.target.value)}
                />
              </div>
              {draft.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDraftRow(i)}
                  aria-label="Remove area"
                  className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-error-tint hover:text-error"
                >
                  <Trash size={16} />
                </button>
              )}
            </div>
          ))}
          {draft.length < MAX_SERVICE_AREAS && (
            <button
              type="button"
              onClick={addDraftRow}
              className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
            >
              <Plus size={15} /> Add another area
            </button>
          )}
        </div>
        {error && <p className="text-[13px] text-error">{error}</p>}
        <div className="flex gap-3">
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="secondary" disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet className="flex flex-col gap-3">
      {areas.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => (
            <span
              key={a.area}
              className="rounded-full bg-wisteria-tint px-3 py-1.5 text-[13px] font-medium text-wisteria-pressed"
            >
              {a.area}
              {a.isPrimary && " · Primary"}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-ink-muted">Not set yet</p>
      )}
      <p className="text-[12px] text-ink-muted">
        Up to 3 areas around your base location where you&apos;re willing to provide care.
      </p>
      <Button variant="secondary" onClick={startEditing} className="self-start">
        <PencilSimple size={15} /> {areas.length > 0 ? "Change" : "Add areas"}
      </Button>
    </Sheet>
  );
}

export function LocationSettingsSection() {
  return (
    <div className="flex flex-col gap-4">
      <LocationSharingSubsection />
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Base Location
        </p>
        <BaseLocationSubsection />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          Service Area
        </p>
        <ServiceAreasSubsection />
      </div>
    </div>
  );
}
