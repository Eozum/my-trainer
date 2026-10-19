import {z} from "zod";
export class CoachError extends Error {
  constructor(public status: number, message: string) {super(message);}
}
export function coachFailure(error: unknown) {
  const status = error instanceof CoachError ? error.status : error instanceof z.ZodError ? 400 : 502;
  return Response.json({error: error instanceof CoachError ? error.message : error instanceof z.ZodError ? "Données invalides." : "Le service est indisponible ou la proposition n’a pas passé les contrôles. Aucun programme n’a été appliqué."}, {status, headers: {"Cache-Control": "no-store"}});
}
export async function jsonBody(req: Request, maxBytes = 500000) {
  const reader = req.body?.getReader();
  if (!reader) throw new CoachError(400, "Corps de requête manquant.");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      length += value.length;
      if (length > maxBytes) {await reader.cancel(); throw new CoachError(413, "Requête trop volumineuse.");}
      chunks.push(value);
    }
    try {return JSON.parse(Buffer.concat(chunks).toString("utf8"));}
    catch {throw new CoachError(400, "JSON invalide.");}
  } finally {reader.releaseLock();}
}
