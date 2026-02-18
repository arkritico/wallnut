/**
 * Geospatial integration for Portuguese territory.
 * Queries DGT (Direção-Geral do Território) and municipal GIS services
 * to auto-detect PDM zoning, RAN/REN, protected areas, etc.
 */

export interface GeoLookupResult {
  /** PDM zoning classification */
  pdmZoning?: string;
  /** Parish (Freguesia) */
  parish?: string;
  /** Is in RAN (Reserva Agrícola Nacional) */
  isInRAN: boolean;
  /** Is in REN (Reserva Ecológica Nacional) */
  isInREN: boolean;
  /** Is in Natura 2000 */
  isInNatura2000: boolean;
  /** Is in flood risk area */
  isFloodRisk: boolean;
  /** Is in ARU (Área de Reabilitação Urbana) */
  isInARU: boolean;
  /** Heritage protection zone */
  heritageZone?: string;
  /** Seismic zone from location */
  seismicZone?: string;
  /** Error if lookup failed */
  error?: string;
  /** Data sources used */
  sources: string[];
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Route WMS/WFS calls through the proxy to avoid CORS issues.
 * Falls back to direct fetch for same-origin or Nominatim requests.
 */
function proxyUrl(directUrl: string): string {
  // Use the geo-proxy API route to bypass CORS for Portuguese GIS services
  if (typeof window !== "undefined") {
    return `/api/geo-proxy?url=${encodeURIComponent(directUrl)}`;
  }
  return directUrl;
}

/**
 * WMS GetFeatureInfo request to a given service.
 * Uses proxy to avoid CORS issues with Portuguese government GIS.
 */
async function queryWMS(
  baseUrl: string,
  layers: string,
  point: GeoPoint,
  srs: string = "EPSG:4326",
): Promise<string | null> {
  try {
    // Convert lat/lng to a bounding box (small area around the point)
    const delta = 0.0001; // ~11m
    const bbox = `${point.longitude - delta},${point.latitude - delta},${point.longitude + delta},${point.latitude + delta}`;

    const params = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.1.1",
      REQUEST: "GetFeatureInfo",
      LAYERS: layers,
      QUERY_LAYERS: layers,
      INFO_FORMAT: "application/json",
      SRS: srs,
      BBOX: bbox,
      WIDTH: "101",
      HEIGHT: "101",
      X: "50",
      Y: "50",
    });

    const directUrl = `${baseUrl}?${params.toString()}`;
    const response = await fetch(proxyUrl(directUrl), {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Query WFS GetFeature for a point.
 * Uses proxy to avoid CORS issues.
 */
async function queryWFS(
  baseUrl: string,
  typeName: string,
  point: GeoPoint,
): Promise<Record<string, unknown> | null> {
  try {
    const filter = `<Filter><Intersects><PropertyName>geom</PropertyName><Point srsName="EPSG:4326"><coordinates>${point.longitude},${point.latitude}</coordinates></Point></Intersects></Filter>`;

    const params = new URLSearchParams({
      SERVICE: "WFS",
      VERSION: "1.1.0",
      REQUEST: "GetFeature",
      TYPENAME: typeName,
      OUTPUTFORMAT: "application/json",
      MAXFEATURES: "1",
      FILTER: filter,
    });

    const directUrl = `${baseUrl}?${params.toString()}`;
    const response = await fetch(proxyUrl(directUrl), {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Reverse geocode a point to get parish and municipality.
 * Uses Nominatim (OpenStreetMap) as a fallback.
 */
async function reverseGeocode(point: GeoPoint): Promise<{
  municipality?: string;
  parish?: string;
  district?: string;
}> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${point.latitude}&lon=${point.longitude}&format=json&addressdetails=1&accept-language=pt`,
      {
        headers: { "User-Agent": "Wallnut/1.0 (building-analysis)" },
        signal: AbortSignal.timeout(10000),
      },
    );
    
    if (!response.ok) return {};
    const data = await response.json() as {
      address?: {
        municipality?: string;
        city?: string;
        town?: string;
        county?: string;
        suburb?: string;
        village?: string;
        state_district?: string;
        state?: string;
      };
    };
    
    const addr = data.address ?? {};
    return {
      municipality: addr.municipality || addr.city || addr.town || addr.county,
      parish: addr.suburb || addr.village,
      district: addr.state_district || addr.state,
    };
  } catch {
    return {};
  }
}

/**
 * Determine seismic zone from coordinates (simplified).
 * Based on EC8 Portuguese National Annex.
 */
function getSeismicZone(point: GeoPoint): string {
  const { latitude, longitude } = point;
  
  // Simplified: Southern Portugal is higher risk
  // Type 1 (far-field) zones
  if (latitude < 37.5) return "1.1"; // Algarve - highest
  if (latitude < 38.5 && longitude < -8.5) return "1.2"; // SW coast
  if (latitude < 39.5) return "1.3"; // Central south
  if (latitude < 40.5) return "1.4"; // Central
  if (latitude < 41.5) return "1.5"; // North
  return "1.6"; // Far north - lowest
}

/**
 * Main lookup function: queries multiple services for a geographic point.
 */
export async function lookupLocation(point: GeoPoint): Promise<GeoLookupResult> {
  const result: GeoLookupResult = {
    isInRAN: false,
    isInREN: false,
    isInNatura2000: false,
    isFloodRisk: false,
    isInARU: false,
    sources: [],
  };

  // Validate coordinates are in Portugal
  if (
    point.latitude < 36.9 || point.latitude > 42.2 ||
    point.longitude < -9.6 || point.longitude > -6.1
  ) {
    result.error = "Coordenadas fora do território continental português.";
    return result;
  }

  const promises: Promise<void>[] = [];

  // 1. Reverse geocode for parish/municipality
  promises.push(
    reverseGeocode(point).then(geo => {
      result.parish = geo.parish;
      result.sources.push("OpenStreetMap/Nominatim");
    }),
  );

  // 2. DGT iGEO - RAN (Reserva Agrícola Nacional)
  promises.push(
    queryWMS(
      "https://geo2.dgadr.gov.pt/geoserver/ows",
      "ran:ran_nacional",
      point,
    ).then(data => {
      if (data && data.includes("features") && !data.includes("\"features\":[]")) {
        result.isInRAN = true;
        result.sources.push("DGADR - RAN");
      }
    }).catch(() => {}),
  );

  // 3. DGT - REN (Reserva Ecológica Nacional)
  promises.push(
    queryWMS(
      "https://sig.icnf.pt/geoserver/ows",
      "ren:ren_vigente",
      point,
    ).then(data => {
      if (data && data.includes("features") && !data.includes("\"features\":[]")) {
        result.isInREN = true;
        result.sources.push("ICNF - REN");
      }
    }).catch(() => {}),
  );

  // 4. ICNF - Natura 2000
  promises.push(
    queryWMS(
      "https://sig.icnf.pt/geoserver/ows",
      "natura2000:sic_zec",
      point,
    ).then(data => {
      if (data && data.includes("features") && !data.includes("\"features\":[]")) {
        result.isInNatura2000 = true;
        result.sources.push("ICNF - Natura 2000");
      }
    }).catch(() => {}),
  );

  // 5. Seismic zone (local calculation)
  result.seismicZone = getSeismicZone(point);
  result.sources.push("EC8 Anexo Nacional (simplificado)");

  // Wait for all queries (with timeout)
  await Promise.allSettled(promises);

  return result;
}

/**
 * Get suggested water utility provider from municipality name.
 */
export function suggestWaterUtility(municipality: string): string | null {
  const m = municipality.toLowerCase().trim();
  
  const map: Record<string, string> = {
    "lisboa": "EPAL",
    "oeiras": "SIMAS Oeiras e Amadora",
    "amadora": "SIMAS Oeiras e Amadora",
    "sintra": "SIMAS Sintra",
    "loures": "SIMAR Loures e Odivelas",
    "odivelas": "SIMAR Loures e Odivelas",
    "cascais": "Águas de Cascais",
    "porto": "Águas do Porto",
    "vila nova de gaia": "Águas de Gaia",
    "matosinhos": "INDAQUA",
    "santo tirso": "INDAQUA",
    "vila do conde": "INDAQUA",
    "fafe": "INDAQUA",
    "feira": "INDAQUA",
    "faro": "Águas do Algarve",
    "albufeira": "Águas do Algarve",
    "loulé": "Águas do Algarve",
    "portimão": "Águas do Algarve",
    "lagos": "Águas do Algarve",
    "cartaxo": "CARTAGUAS",
  };

  return map[m] ?? null;
}
