import { z } from "zod";
import { activitySchema, addDays, day, type Activity } from "./model";

const api = "https://personal.connectapi.garmin.com";
const pageSize = 100;
const limit = 1000;
export const garminKeySchema = z.string().trim().max(768).regex(/^[!-~]+$/);

const summarySchema = z.object({
  activityId: z.number().int().positive(),
  activityName: z.string().nullish(),
  activityType: z.object({ typeKey: z.string() }),
  startTimeLocal: z.string(),
  distance: z.number().positive(),
  movingDuration: z.number().nullish(),
  duration: z.number().nullish(),
  elevationGain: z.number().nonnegative().nullish(),
});

export class GarminError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function checkResponse(response: Response, exchangingKey: boolean) {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403 || (exchangingKey && response.status === 400)) {
    throw new GarminError(401, "Garmin a refusé la connexion. Vérifie que ta clé personnelle est valide et qu’elle n’a pas expiré.");
  }
  if (response.status === 429) throw new GarminError(429, "Garmin limite temporairement les requêtes. Réessaie dans quelques minutes.");
  throw new GarminError(502, "Garmin Connect est indisponible. Réessaie dans quelques instants.");
}

export async function garminToken(key: string, signal = AbortSignal.timeout(12000)) {
  const response = await fetch(`${api}/personalapitoken-service/personal-api/personal-api-key/token`, {
    method: "POST",
    headers: { Authorization: `ApiKey ${key}`, Accept: "*/*" },
    cache: "no-store",
    redirect: "error",
    signal,
  });
  checkResponse(response, true);
  const token = (await response.text()).trim();
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new GarminError(502, "Garmin Connect a renvoyé un jeton inattendu.");
  }
  return token;
}

export function normalizeGarminActivity(value: unknown): Activity | null {
  const result = summarySchema.safeParse(value);
  if (!result.success) return null;
  const row = result.data;
  const { typeKey } = row.activityType;
  if (typeKey !== "running" && !typeKey.endsWith("_running") && typeKey !== "ultra_run") return null;

  const duration = row.movingDuration && row.movingDuration > 0 ? row.movingDuration : row.duration;
  const activity = activitySchema.safeParse({
    id: `garmin:${row.activityId}`,
    date: row.startTimeLocal.slice(0, 10),
    name: row.activityName?.trim().slice(0, 200) || undefined,
    distance: row.distance / 1000,
    minutes: (duration ?? 0) / 60,
    elevation: row.elevationGain ?? 0,
  });
  return activity.success ? activity.data : null;
}

export async function garminActivities(key: string, today = day()) {
  const signal = AbortSignal.timeout(45000);
  const token = await garminToken(key, signal);
  const since = addDays(today, -89);
  const activities = new Map<string, Activity>();
  for (let start = 0; start <= limit; start += pageSize) {
    const url = new URL("/activitylist-service/activities/search/activities", api);
    url.search = new URLSearchParams({
      start: String(start), limit: String(pageSize), activityType: "running",
      startDate: since, endDate: today,
    }).toString();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
      cache: "no-store",
      redirect: "error",
      signal,
    });
    checkResponse(response, false);
    if (response.status === 204) break;
    const rows = z.array(z.unknown()).max(pageSize).parse(await response.json());
    if (start === limit && rows.length) {
      throw new GarminError(422, "Garmin renvoie plus de 1 000 sorties sur la période. L’import n’a pas été effectué.");
    }
    for (const row of rows) {
      const activity = normalizeGarminActivity(row);
      if (activity && activity.date >= since && activity.date <= today) activities.set(activity.id, activity);
    }
    if (rows.length < pageSize) break;
  }
  return [...activities.values()];
}
