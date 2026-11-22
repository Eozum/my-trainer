import {addDays, type Activity} from "./model";

export type Period = "7" | "30" | "all";

export function statistics(activities: Activity[], period: Period, today: string) {
  const from = period === "all" ? null : addDays(today, -(Number(period) - 1));
  const recent = activities.filter(activity => activity.date <= today && (!from || activity.date >= from))
    .slice().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const distance = recent.reduce((sum, activity) => sum + activity.distance, 0);
  const minutes = recent.reduce((sum, activity) => sum + activity.minutes, 0);
  return {
    activities: recent,
    count: recent.length,
    distance,
    averageDistance: recent.length ? distance / recent.length : null,
    // Weight by distance: averaging individual paces overweights short runs.
    pace: distance ? minutes / distance : null,
    minutes,
    elevation: recent.reduce((sum, activity) => sum + activity.elevation, 0),
  };
}

export function formatPace(minutesPerKm: number | null) {
  if (minutesPerKm === null || !Number.isFinite(minutesPerKm) || minutesPerKm <= 0) return "—";
  const seconds = Math.round(minutesPerKm * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number) {
  const rounded = Math.round(minutes);
  return rounded >= 60 ? `${Math.floor(rounded / 60)} h ${String(rounded % 60).padStart(2, "0")}` : `${rounded} min`;
}

export function activityBuckets(activities: Activity[], period: Period, today: string) {
  const recent = statistics(activities, period, today).activities;
  if (!recent.length) return [];
  const first = period === "all" ? recent.at(-1)!.date : addDays(today, 1 - Number(period));
  const dayIndex = (date: string) => Math.round((Date.parse(date) - Date.parse(first)) / 86400000);
  const days = dayIndex(today) + 1;
  const step = period === "7" ? 1 : Math.max(1, Math.ceil(days / 84)) * 7;
  const buckets = Array.from({ length: Math.ceil(days / step) }, (_, index) => ({
    start: addDays(first, index * step),
    end: addDays(first, Math.min(days - 1, (index + 1) * step - 1)),
    distance: 0,
    elevation: 0,
    minutes: 0,
  }));
  for (const run of recent) {
    const bucket = buckets[Math.floor(dayIndex(run.date) / step)];
    bucket.distance += run.distance;
    bucket.elevation += run.elevation;
    bucket.minutes += run.minutes;
  }
  return buckets.map(bucket => ({ ...bucket, pace: bucket.distance ? bucket.minutes / bucket.distance : null }));
}
