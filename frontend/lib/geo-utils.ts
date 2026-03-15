/**
 * Geospatial utilities for point-in-polygon and point-in-circle checks.
 * Coordinates use GeoJSON order: [longitude, latitude].
 */

/** Ray-casting algorithm: returns true if point is inside polygon. */
export function isPointInPolygon(
  point: [number, number],
  polygon: number[][]
): boolean {
  const [x, y] = point
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Earth radius in miles (approximate). */
const EARTH_RADIUS_MILES = 3958.8

/** Haversine distance in miles between two [lng, lat] points. */
export function haversineDistanceMiles(
  a: [number, number],
  b: [number, number]
): number {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return EARTH_RADIUS_MILES * c
}

/** Returns true if point is within radiusMiles of center. */
export function isPointInCircle(
  point: [number, number],
  center: [number, number],
  radiusMiles: number
): boolean {
  return haversineDistanceMiles(point, center) <= radiusMiles
}
