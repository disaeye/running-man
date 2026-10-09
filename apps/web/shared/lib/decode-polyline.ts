/**
 * Google Encoded Polyline Algorithm decoder.
 *
 * See: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * Decodes a signed, zigzag-encoded polyline string into an array of lat/lon pairs.
 * Handles invalid input gracefully — returns an empty array instead of throwing.
 */

export type PolylinePoint = {
  readonly lat: number;
  readonly lon: number;
};

function decodeSignedValue(encoded: string, index: { value: number }): number | null {
  let val = 0;
  let shift = 0;
  let byte: number;

  do {
    if (index.value >= encoded.length) return null;
    byte = encoded.charCodeAt(index.value) - 63;
    // Valid polyline characters are ASCII 63-126 ('?' through '~').
    // Anything outside this range is garbled input.
    if (byte < 0 || byte > 63) return null;
    index.value += 1;
    val |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);

  return (val >> 1) ^ -(val & 1);
}

/**
 * Decode a Google Encoded Polyline string to an array of {lat, lon} points.
 *
 * @param encoded - The polyline string to decode.
 * @param precision - Number of decimal digits (default 5, matching Google's standard).
 * @returns Array of decoded points, or `[]` for empty/invalid input.
 */
export function decodePolyline(
  encoded: string,
  precision: number = 5,
): PolylinePoint[] {
  if (encoded.length === 0) return [];

  const factor = 10 ** precision;
  const points: PolylinePoint[] = [];
  const index = { value: 0 };
  let lat = 0;
  let lon = 0;

  while (index.value < encoded.length) {
    const dlat = decodeSignedValue(encoded, index);
    if (dlat === null) break;
    const dlon = decodeSignedValue(encoded, index);
    if (dlon === null) break;

    lat += dlat;
    lon += dlon;

    points.push({
      lat: lat / factor,
      lon: lon / factor,
    });
  }

  // If we couldn't decode a full pair, return empty — don't return partial data
  // since garbled input shouldn't produce misleading coordinates.
  return points.length > 0 ? points : [];
}
