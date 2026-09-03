// CareLink's one geocoding integration: OpenStreetMap's Nominatim, the
// service you approved (free, no account or API key). Two directions —
// forward (an address the parent typed -> coordinates) and reverse
// (coordinates from the device's own GPS -> a human-readable address) —
// both used the same way "AI output is untrusted input" is treated
// elsewhere in this codebase (nl-search.ts, photo-check.ts): a
// third-party response is parsed defensively and a total failure
// returns null, never a fabricated coordinate or address.
//
// Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// asks for a real identifying User-Agent and roughly one request per
// second. The identifying header is set on every request below; the
// rate limit is a simple in-memory queue — a genuine best-effort, not a
// hard guarantee across multiple concurrent serverless function
// instances, which is an honest limit of this approach worth knowing
// rather than a gap to silently paper over.

export type GeocodeResult = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
  // The coarsest named area Nominatim's own address breakdown offers
  // (suburb/neighbourhood, falling back to a wider one) — this is what
  // keeps the existing area-string match (computeAreaFit) working for
  // any caregiver who hasn't been geocoded yet, without inventing a
  // new taxonomy on top of what the geocoder already returns.
  coarseArea: string | null;
};

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const USER_AGENT = "CareLink/1.0 (https://carelink-frontend-six.vercel.app)";
const MIN_REQUEST_GAP_MS = 1100;

// A module-level queue, not per-request state — every call from this
// server process (this function instance) funnels through the same
// last-request timestamp, so bursts still get spaced out.
let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  // Keep the chain alive even if this particular call rejects, so one
  // failed geocode doesn't wedge every request after it.
  queue = run.catch(() => undefined);
  return run;
}

type NominatimAddress = {
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city_district?: string;
  town?: string;
  city?: string;
  county?: string;
};

type NominatimPlace = {
  place_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
};

function coarseAreaFrom(address: NominatimAddress | undefined): string | null {
  if (!address) return null;
  return (
    address.suburb ??
    address.neighbourhood ??
    address.quarter ??
    address.city_district ??
    address.town ??
    address.city ??
    address.county ??
    null
  );
}

function toResult(place: NominatimPlace): GeocodeResult | null {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (
    !place.display_name ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }
  return {
    formattedAddress: place.display_name,
    latitude: lat,
    longitude: lon,
    placeId: place.place_id != null ? String(place.place_id) : null,
    coarseArea: coarseAreaFrom(place.address),
  };
}

async function fetchNominatim(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${NOMINATIM_BASE_URL}${path}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Forward: an address the parent typed -> a resolved point. Restricted
// to Ghana (countrycodes=gh) since that's the only country CareLink
// operates in — cuts down on a same-named place resolving somewhere
// else in the world. Returns null on no match or any provider failure;
// never invents a fallback coordinate.
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  return throttled(async () => {
    const params = new URLSearchParams({
      q: trimmed,
      format: "jsonv2",
      addressdetails: "1",
      limit: "1",
      countrycodes: "gh",
    });
    const data = await fetchNominatim(`/search?${params.toString()}`);
    if (!Array.isArray(data) || data.length === 0) return null;
    return toResult(data[0] as NominatimPlace);
  });
}

// Reverse: coordinates from the device's own GPS -> a human-readable
// address, so a parent using "Use my current location" never has to
// read or understand the raw numbers themselves.
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodeResult | null> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return throttled(async () => {
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      format: "jsonv2",
      addressdetails: "1",
    });
    const data = await fetchNominatim(`/reverse?${params.toString()}`);
    if (!data || typeof data !== "object") return null;
    const result = toResult(data as NominatimPlace);
    // The geocoder's own address text is preferred for display, but the
    // coordinates are the device's own real GPS reading, not whatever
    // (possibly slightly rounded) point the geocoder snapped to — keep
    // the original fix.
    return result ? { ...result, latitude, longitude } : null;
  });
}
