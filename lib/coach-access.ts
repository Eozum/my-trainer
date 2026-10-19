import {cookies} from "next/headers";
import {createHash, timingSafeEqual} from "node:crypto";
import {seal, unseal} from "./vault";
import {CoachError} from "./coach-http";

export const accessCookie = "eotrainer_coach";
const options = {httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/coach"};
function fingerprint(value: string) {return createHash("sha256").update(value).digest("hex");}
function accessKey() {
  const key = process.env.EOTRAINER_ACCESS_KEY;
  if (!key || key.length < 32) throw new CoachError(503, "Le carnet privé n’est pas configuré.");
  return key;
}
export function sameOrigin(req: Request) {
  const app = process.env.APP_URL;
  if (!app || req.headers.get("origin") !== new URL(app).origin) throw new CoachError(403, "Origine non autorisée.");
}
export function validAccessKey(provided: string) {
  return timingSafeEqual(Buffer.from(fingerprint(provided)), Buffer.from(fingerprint(accessKey())));
}
export async function unlock() {
  const expires = Date.now() + 7 * 86400000;
  (await cookies()).set(accessCookie, seal(JSON.stringify({purpose: "coach", fingerprint: fingerprint(accessKey()), expires})), {...options, maxAge: 7 * 86400});
}
export async function lock() {(await cookies()).delete({name: accessCookie, path: options.path});}
export async function requireCoach(req?: Request) {
  if (req) sameOrigin(req);
  const expected = fingerprint(accessKey());
  try {
    const value = (await cookies()).get(accessCookie)?.value;
    if (!value) throw Error();
    const session = unseal(value);
    if (session.purpose !== "coach" || typeof session.expires !== "number" || session.expires <= Date.now() || session.fingerprint !== expected) throw Error();
  } catch {throw new CoachError(401, "Déverrouille ton carnet privé.");}
}
