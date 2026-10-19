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
