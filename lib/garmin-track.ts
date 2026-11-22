import { Decoder, Stream } from "@garmin/fitsdk";
import { unzipSync } from "fflate";
import { GarminError, garminToken } from "./garmin";
import { routePoints } from "./route-points";

const maxBytes = 12 * 1024 * 1024;
const semicircle = 180 / 2 ** 31;

async function readDownload(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new GarminError(422, "Le fichier GPS de cette course est trop volumineux.");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

export function trackFromFit(bytes: Uint8Array) {
  let unzipBudget = maxBytes;
  const fits = bytes[0] === 0x50 && bytes[1] === 0x4b
    ? Object.values(unzipSync(bytes, {
      filter: entry => {
        if (!/\.fit$/i.test(entry.name) || entry.originalSize > unzipBudget) return false;
        unzipBudget -= entry.originalSize;
        return true;
      },
    }))
    : [bytes];
  for (const fit of fits) {
    const decoder = new Decoder(Stream.fromBuffer(Buffer.from(fit)));
    if (!decoder.checkIntegrity()) continue;
    const { messages } = decoder.read({ applyScaleAndOffset: true });
    const points = routePoints(messages.recordMesgs?.map(record => [
      record.positionLat === undefined ? null : record.positionLat * semicircle,
      record.positionLong === undefined ? null : record.positionLong * semicircle,
    ]));
    if (points.length) return points;
  }
  return [];
}

export async function garminTrack(id: string, key: string) {
  const signal = AbortSignal.timeout(22000);
  const token = await garminToken(key, signal);
  const response = await fetch(`https://personal.connectapi.garmin.com/download-service/files/activity/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/zip, application/x-zip-compressed, application/octet-stream" },
    cache: "no-store", redirect: "error", signal,
  });
  if (response.status === 404 || response.status === 204) return [];
  if (!response.ok) throw new GarminError(response.status === 429 ? 429 : 502, "Le tracé Garmin est indisponible. Réessaie dans quelques instants.");
  return trackFromFit(await readDownload(response));
}
