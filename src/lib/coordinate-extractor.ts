/**
 * GPS Coordinate Extractor for Portuguese Building Documents.
 *
 * Extracts coordinates from PDF text content of "Planta de Localização"
 * and "Levantamento Topográfico" documents. The file classification in
 * zip-processor.ts already sets `hasCoordinates: true` for these files,
 * and document-parser.ts provides `extractTextFromFile()` for PDF text.
 *
 * Supported coordinate formats:
 *   1. PT-TM06/ETRS89 (official Portuguese system)
 *   2. WGS84 decimal degrees
 *   3. WGS84 DMS (degrees/minutes/seconds)
 *   4. UTM Zone 29N (common in Portugal)
 *   5. Coordinate pairs in tables (Norte/Este)
 *
 * Reference datums:
 *   - PT-TM06/ETRS89: Transverse Mercator, central meridian -8.1331,
 *     false easting 0, false northing 0, scale factor 1.0
 *   - UTM Zone 29N: Transverse Mercator, central meridian -9°,
 *     false easting 500000, false northing 0, scale factor 0.9996
 */

// ============================================================
// Types
// ============================================================

export type CoordinateFormat =
  | "wgs84_decimal"
  | "wgs84_dms"
  | "pt_tm06"
  | "utm_29n"
  | "unknown";

export interface ExtractedCoordinates {
  /** WGS84 latitude (decimal degrees) */
  latitude: number;
  /** WGS84 longitude (decimal degrees) */
  longitude: number;
  /** Format detected in the source text */
  format: CoordinateFormat;
  /** Confidence of the extraction */
  confidence: "high" | "medium" | "low";
  /** The raw text that was matched */
  rawText: string;
  /** Source filename */
  source: string;
}

// ============================================================
// Continental Portugal bounding box (WGS84)
// ============================================================

/** Latitude bounds for continental Portugal */
const PT_LAT_MIN = 36.9;
const PT_LAT_MAX = 42.2;

/** Longitude bounds for continental Portugal */
const PT_LNG_MIN = -9.6;
const PT_LNG_MAX = -6.1;

// ============================================================
// PT-TM06/ETRS89 projection parameters
// ============================================================

/**
 * PT-TM06/ETRS89 uses the GRS80 ellipsoid with a Transverse Mercator
 * projection. Parameters from DGT (Direção-Geral do Território).
 */
const PT_TM06 = {
  /** Semi-major axis (GRS80) */
  a: 6378137.0,
  /** Flattening (GRS80) */
  f: 1 / 298.257222101,
  /** Central meridian (degrees) */
  centralMeridian: -8.13310833333333, // -8° 07' 59.19"
  /** Latitude of origin (degrees) */
  latitudeOfOrigin: 39.66825833333333, // 39° 40' 05.73"
  /** False easting (m) */
  falseEasting: 0,
  /** False northing (m) */
  falseNorthing: 0,
  /** Scale factor at central meridian */
  scaleFactor: 1.0,
};

// ============================================================
// UTM Zone 29N projection parameters
// ============================================================

const UTM_29N = {
  a: 6378137.0,
  f: 1 / 298.257223563, // WGS84
  centralMeridian: -9.0,
  falseEasting: 500000,
  falseNorthing: 0,
  scaleFactor: 0.9996,
};

// ============================================================
// Coordinate validation
// ============================================================

/**
 * Validate that coordinates fall within continental Portugal bounds.
 */
export function validatePortugalCoordinates(lat: number, lng: number): boolean {
  return (
    lat >= PT_LAT_MIN &&
    lat <= PT_LAT_MAX &&
    lng >= PT_LNG_MIN &&
    lng <= PT_LNG_MAX
  );
}

// ============================================================
// Conversion functions
// ============================================================

/**
 * Convert degrees, minutes, seconds to decimal degrees.
 *
 * @param degrees - Integer degrees
 * @param minutes - Integer minutes
 * @param seconds - Decimal seconds
 * @param direction - Cardinal direction (N/S for latitude, E/W for longitude)
 * @returns Decimal degrees (negative for S and W)
 */
export function dmsToDecimal(
  degrees: number,
  minutes: number,
  seconds: number,
  direction: "N" | "S" | "E" | "W",
): number {
  const decimal = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  return direction === "S" || direction === "W" ? -decimal : decimal;
}

/**
 * Inverse Transverse Mercator projection.
 *
 * Converts easting/northing in a TM projection back to WGS84 lat/lon.
 * Uses the series expansion method (Karney's approach simplified).
 *
 * @param easting - Easting in meters
 * @param northing - Northing in meters
 * @param params - Projection parameters (a, f, centralMeridian, etc.)
 * @returns WGS84 latitude and longitude in decimal degrees
 */
function inverseTM(
  easting: number,
  northing: number,
  params: {
    a: number;
    f: number;
    centralMeridian: number;
    latitudeOfOrigin?: number;
    falseEasting: number;
    falseNorthing: number;
    scaleFactor: number;
  },
): { latitude: number; longitude: number } {
  const { a, f, centralMeridian, falseEasting, falseNorthing, scaleFactor } = params;
  const latOrigin = (params.latitudeOfOrigin ?? 0) * (Math.PI / 180);

  const e2 = 2 * f - f * f; // First eccentricity squared
  const e = Math.sqrt(e2);
  const ep2 = e2 / (1 - e2); // Second eccentricity squared
  const n = f / (2 - f); // Third flattening
  const n2 = n * n;
  const n3 = n * n2;
  const n4 = n * n3;

  // Rectifying radius
  const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64);

  // Meridian arc from equator to latitude of origin
  const M0 = meridianArc(latOrigin, a, e2);

  // Remove false easting/northing and scale
  const x = (easting - falseEasting) / scaleFactor;
  const y = (northing - falseNorthing + M0 * scaleFactor) / scaleFactor;

  // Footpoint latitude using Bowring's method
  const mu = y / A;

  // Series coefficients for inverse
  const beta1 = n / 2 - (2 / 3) * n2 + (37 / 96) * n3;
  const beta2 = (1 / 48) * n2 + (1 / 15) * n3;
  const beta3 = (17 / 480) * n3;

  const phiPrime =
    mu +
    beta1 * Math.sin(2 * mu) +
    beta2 * Math.sin(4 * mu) +
    beta3 * Math.sin(6 * mu);

  const sinPhi = Math.sin(phiPrime);
  const cosPhi = Math.cos(phiPrime);
  const tanPhi = sinPhi / cosPhi;

  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const R = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const D = x / N;

  const D2 = D * D;
  const D3 = D2 * D;
  const D4 = D2 * D2;
  const D5 = D4 * D;
  const D6 = D4 * D2;

  const lat =
    phiPrime -
    ((N * tanPhi) / R) *
      (D2 / 2 -
        ((5 + 3 * T + 10 * C - 4 * C * C - 9 * ep2) * D4) / 24 +
        ((61 + 90 * T + 298 * C + 45 * T * T - 252 * ep2 - 3 * C * C) * D6) / 720);

  const lon =
    (D -
      ((1 + 2 * T + C) * D3) / 6 +
      ((5 - 2 * C + 28 * T - 3 * C * C + 8 * ep2 + 24 * T * T) * D5) / 120) /
    cosPhi;

  const latDeg = lat * (180 / Math.PI);
  const lonDeg = centralMeridian + lon * (180 / Math.PI);

  return { latitude: latDeg, longitude: lonDeg };
}

/**
 * Compute meridian arc length from equator to latitude phi.
 */
function meridianArc(phi: number, a: number, e2: number): number {
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  return (
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  );
}

/**
 * Convert PT-TM06/ETRS89 coordinates to WGS84.
 *
 * PT-TM06 uses the GRS80 ellipsoid which is practically identical to WGS84
 * (sub-millimeter differences), so no additional datum shift is needed.
 *
 * @param easting - PT-TM06 M coordinate (easting) in meters
 * @param northing - PT-TM06 P coordinate (northing) in meters
 * @returns WGS84 latitude and longitude in decimal degrees
 */
export function ptTm06ToWgs84(
  easting: number,
  northing: number,
): { latitude: number; longitude: number } {
  return inverseTM(easting, northing, PT_TM06);
}

/**
 * Convert UTM coordinates to WGS84.
 *
 * @param zone - UTM zone number (e.g. 29)
 * @param easting - UTM easting in meters
 * @param northing - UTM northing in meters
 * @param northern - true for northern hemisphere
 * @returns WGS84 latitude and longitude in decimal degrees
 */
export function utmToWgs84(
  zone: number,
  easting: number,
  northing: number,
  northern: boolean,
): { latitude: number; longitude: number } {
  const centralMeridian = (zone - 1) * 6 - 180 + 3;
  const falseNorthing = northern ? 0 : 10000000;

  return inverseTM(easting, northing, {
    a: UTM_29N.a,
    f: UTM_29N.f,
    centralMeridian,
    falseEasting: 500000,
    falseNorthing,
    scaleFactor: 0.9996,
  });
}

// ============================================================
// PT-TM06 coordinate range validation
// ============================================================

/**
 * Validate that easting/northing values are plausible for PT-TM06.
 * Continental Portugal in PT-TM06 typically has:
 *   M (easting): roughly -120000 to 160000
 *   P (northing): roughly -310000 to 280000
 */
function isPlausiblePtTm06(easting: number, northing: number): boolean {
  return (
    easting >= -200000 &&
    easting <= 200000 &&
    northing >= -350000 &&
    northing <= 350000
  );
}

/**
 * Validate that easting/northing values are plausible for UTM Zone 29N
 * over continental Portugal.
 *   Easting: roughly 430000 to 620000
 *   Northing: roughly 4090000 to 4680000
 */
function isPlausibleUtm29n(easting: number, northing: number): boolean {
  return (
    easting >= 400000 &&
    easting <= 650000 &&
    northing >= 4000000 &&
    northing <= 4750000
  );
}

// ============================================================
// Regex patterns for coordinate extraction
// ============================================================

/**
 * PT-TM06/ETRS89 patterns.
 * Common formats in Portuguese documents:
 *   M = 123456.78  P = 234567.89
 *   M = -12345.67  P = 234567.89
 *   X: 123456  Y: 234567
 *   X = 123456.78, Y = 234567.89
 */
const PT_TM06_PATTERNS: RegExp[] = [
  // M = 123456.78 P = 234567.89 (with optional signs and decimals)
  /M\s*[=:]\s*(-?\d{4,6}(?:[.,]\d+)?)\s*[,;]?\s*P\s*[=:]\s*(-?\d{4,6}(?:[.,]\d+)?)/gi,
  // X: 123456 Y: 234567 or X = 123456, Y = 234567
  /X\s*[=:]\s*(-?\d{4,6}(?:[.,]\d+)?)\s*[,;]?\s*Y\s*[=:]\s*(-?\d{4,6}(?:[.,]\d+)?)/gi,
];

/**
 * WGS84 decimal degree patterns.
 * Common formats:
 *   38.7223° N, 9.1393° W
 *   38.7223°N 9.1393°W
 *   Lat: 38.7223 Lon: -9.1393
 *   Latitude: 38.7223, Longitude: -9.1393
 */
const WGS84_DECIMAL_PATTERNS: RegExp[] = [
  // 38.7223° N, 9.1393° W  or  38.7223°N 9.1393°W
  /(-?\d{1,2}[.,]\d{2,8})\s*°?\s*([NS])\s*[,;]?\s*(-?\d{1,2}[.,]\d{2,8})\s*°?\s*([EW])/gi,
  // Lat: 38.7223 Lon: -9.1393  or  Latitude: 38.7223, Longitude: -9.1393
  /Lat(?:itude)?\s*[=:]\s*(-?\d{1,2}[.,]\d{2,8})\s*[,;]?\s*Lon(?:gitude)?\s*[=:]\s*(-?\d{1,2}[.,]\d{2,8})/gi,
];

/**
 * WGS84 DMS patterns.
 * Common formats:
 *   38°43'20"N 9°08'21"W
 *   38° 43' 20" N  9° 08' 21" W
 *   38°43'20.5"N, 9°08'21.3"W
 */
const WGS84_DMS_PATTERNS: RegExp[] = [
  // 38°43'20"N 9°08'21"W (with optional decimals on seconds)
  /(\d{1,2})\s*°\s*(\d{1,2})\s*[''′]\s*(\d{1,2}(?:[.,]\d+)?)\s*[""″]\s*([NS])\s*[,;]?\s*(\d{1,3})\s*°\s*(\d{1,2})\s*[''′]\s*(\d{1,2}(?:[.,]\d+)?)\s*[""″]\s*([EW])/gi,
];

/**
 * UTM Zone 29N patterns.
 * Common formats:
 *   29S 0492000 4289000
 *   29N 492000 4289000
 *   UTM 29N: 492000 E, 4289000 N
 *   Zone 29N E492000 N4289000
 */
const UTM_PATTERNS: RegExp[] = [
  // 29S 0492000 4289000  or  29N 492000 4289000
  /29\s*([NS])\s+0?(\d{5,7})\s+(\d{6,8})/gi,
  // UTM 29N: 492000 E, 4289000 N  or  UTM29N 492000E 4289000N
  /UTM\s*29\s*([NS])\s*[:]?\s*(\d{5,7})\s*E?\s*[,;]?\s*(\d{6,8})\s*N?/gi,
  // Zone 29N E492000 N4289000
  /[Zz]on[ae]?\s*29\s*([NS])\s*E?\s*(\d{5,7})\s*[,;]?\s*N?\s*(\d{6,8})/gi,
];

/**
 * Table-style coordinate patterns (common in topographic surveys).
 * Common formats:
 *   Norte: 4289000  Este: 492000
 *   Norte = 4289000, Este = 492000
 *   N: 4289000 E: 492000
 */
const TABLE_PATTERNS: RegExp[] = [
  // Norte: 4289000 Este: 492000
  /Norte\s*[=:]\s*(\d{6,8}(?:[.,]\d+)?)\s*[,;]?\s*Este\s*[=:]\s*(\d{5,7}(?:[.,]\d+)?)/gi,
  // Este: 492000 Norte: 4289000
  /Este\s*[=:]\s*(\d{5,7}(?:[.,]\d+)?)\s*[,;]?\s*Norte\s*[=:]\s*(\d{6,8}(?:[.,]\d+)?)/gi,
];

// ============================================================
// Number parsing helper
// ============================================================

/**
 * Parse a number string that may use Portuguese formatting (comma as decimal).
 */
function parseCoordNumber(s: string): number {
  return parseFloat(s.replace(",", "."));
}

// ============================================================
// Coordinate extraction from text
// ============================================================

/**
 * Extract GPS coordinates from text content of a document.
 *
 * Tries all supported coordinate formats and returns all matches,
 * each converted to WGS84 and validated against Portugal bounds.
 *
 * @param text - Text content extracted from a PDF or document
 * @param source - Filename for provenance tracking
 * @returns Array of extracted coordinates, sorted by confidence (highest first)
 */
export function extractCoordinatesFromText(
  text: string,
  source: string,
): ExtractedCoordinates[] {
  const results: ExtractedCoordinates[] = [];

  // 1. WGS84 decimal degrees (highest confidence — already in target format)
  for (const pattern of WGS84_DECIMAL_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      let lat: number;
      let lng: number;

      if (match.length === 5) {
        // Format: value N/S, value E/W
        lat = parseCoordNumber(match[1]);
        if (match[2] === "S") lat = -lat;
        lng = parseCoordNumber(match[3]);
        if (match[4] === "W") lng = -lng;
      } else {
        // Format: Lat: value, Lon: value (already signed)
        lat = parseCoordNumber(match[1]);
        lng = parseCoordNumber(match[2]);
      }

      if (validatePortugalCoordinates(lat, lng)) {
        results.push({
          latitude: lat,
          longitude: lng,
          format: "wgs84_decimal",
          confidence: "high",
          rawText: match[0].trim(),
          source,
        });
      }
    }
  }

  // 2. WGS84 DMS
  for (const pattern of WGS84_DMS_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const latDeg = parseInt(match[1], 10);
      const latMin = parseInt(match[2], 10);
      const latSec = parseCoordNumber(match[3]);
      const latDir = match[4].toUpperCase() as "N" | "S";

      const lngDeg = parseInt(match[5], 10);
      const lngMin = parseInt(match[6], 10);
      const lngSec = parseCoordNumber(match[7]);
      const lngDir = match[8].toUpperCase() as "E" | "W";

      const lat = dmsToDecimal(latDeg, latMin, latSec, latDir);
      const lng = dmsToDecimal(lngDeg, lngMin, lngSec, lngDir);

      if (validatePortugalCoordinates(lat, lng)) {
        results.push({
          latitude: lat,
          longitude: lng,
          format: "wgs84_dms",
          confidence: "high",
          rawText: match[0].trim(),
          source,
        });
      }
    }
  }

  // 3. PT-TM06/ETRS89
  for (const pattern of PT_TM06_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const easting = parseCoordNumber(match[1]);
      const northing = parseCoordNumber(match[2]);

      if (!isPlausiblePtTm06(easting, northing)) continue;

      try {
        const { latitude, longitude } = ptTm06ToWgs84(easting, northing);

        if (validatePortugalCoordinates(latitude, longitude)) {
          results.push({
            latitude,
            longitude,
            format: "pt_tm06",
            confidence: "medium",
            rawText: match[0].trim(),
            source,
          });
        }
      } catch {
        // Conversion failed — skip this match
      }
    }
  }

  // 4. UTM Zone 29N
  for (const pattern of UTM_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const hemisphere = match[1].toUpperCase();
      const easting = parseCoordNumber(match[2]);
      const northing = parseCoordNumber(match[3]);
      const northern = hemisphere === "N";

      if (!isPlausibleUtm29n(easting, northing)) continue;

      try {
        const { latitude, longitude } = utmToWgs84(29, easting, northing, northern);

        if (validatePortugalCoordinates(latitude, longitude)) {
          results.push({
            latitude,
            longitude,
            format: "utm_29n",
            confidence: "medium",
            rawText: match[0].trim(),
            source,
          });
        }
      } catch {
        // Conversion failed — skip this match
      }
    }
  }

  // 5. Table-style coordinates (Norte/Este — typically UTM 29N)
  for (const pattern of TABLE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      let northing: number;
      let easting: number;

      if (/Norte/i.test(match[0].slice(0, 6))) {
        // "Norte: value  Este: value"
        northing = parseCoordNumber(match[1]);
        easting = parseCoordNumber(match[2]);
      } else {
        // "Este: value  Norte: value"
        easting = parseCoordNumber(match[1]);
        northing = parseCoordNumber(match[2]);
      }

      // Determine if UTM 29N or PT-TM06 based on value ranges
      if (isPlausibleUtm29n(easting, northing)) {
        try {
          const { latitude, longitude } = utmToWgs84(29, easting, northing, true);

          if (validatePortugalCoordinates(latitude, longitude)) {
            results.push({
              latitude,
              longitude,
              format: "utm_29n",
              confidence: "low",
              rawText: match[0].trim(),
              source,
            });
          }
        } catch {
          // Conversion failed — skip
        }
      } else if (isPlausiblePtTm06(easting, northing)) {
        try {
          const { latitude, longitude } = ptTm06ToWgs84(easting, northing);

          if (validatePortugalCoordinates(latitude, longitude)) {
            results.push({
              latitude,
              longitude,
              format: "pt_tm06",
              confidence: "low",
              rawText: match[0].trim(),
              source,
            });
          }
        } catch {
          // Conversion failed — skip
        }
      }
    }
  }

  // Sort by confidence (high > medium > low)
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

  // Deduplicate: if two results are within ~50m of each other, keep the higher-confidence one
  return deduplicateCoordinates(results);
}

// ============================================================
// Deduplication
// ============================================================

/**
 * Remove duplicate coordinate results that are within ~50m of each other,
 * keeping the higher-confidence match.
 */
function deduplicateCoordinates(coords: ExtractedCoordinates[]): ExtractedCoordinates[] {
  if (coords.length <= 1) return coords;

  const kept: ExtractedCoordinates[] = [];
  const used = new Set<number>();

  for (let i = 0; i < coords.length; i++) {
    if (used.has(i)) continue;

    kept.push(coords[i]);

    // Mark any subsequent nearby coordinates as duplicates
    for (let j = i + 1; j < coords.length; j++) {
      if (used.has(j)) continue;

      const distMeters = haversineDistance(
        coords[i].latitude,
        coords[i].longitude,
        coords[j].latitude,
        coords[j].longitude,
      );

      if (distMeters < 50) {
        used.add(j);
      }
    }
  }

  return kept;
}

/**
 * Approximate distance between two WGS84 points using the Haversine formula.
 * Returns distance in meters.
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
