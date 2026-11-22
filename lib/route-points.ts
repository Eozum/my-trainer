export type TrackPoint = [latitude: number, longitude: number];
const maxPoints = 1800;

export function routePoints(values: unknown): TrackPoint[] {
  const points: TrackPoint[] = [];
  if (!Array.isArray(values)) return points;
  for (const pair of values) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [lat, lon] = pair;
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)
      || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const previous = points.at(-1);
    if (!previous || previous[0] !== lat || previous[1] !== lon) points.push([lat, lon]);
  }
  if (points.length < 2) return [];
  if (points.length <= maxPoints) return points;
  return Array.from({ length: maxPoints }, (_, index) =>
    points[Math.round(index * (points.length - 1) / (maxPoints - 1))]);
}

export function providerActivityId(value: string | null) {
  return value && /^\d{1,16}$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? value : null;
}
