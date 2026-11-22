import { type NextRequest, type NextResponse } from "next/server";
import { z } from "zod";
import { encrypt, decrypt, hasEncryptionKey } from "./vault";
import { credentialsSchema, tokenSchema } from "./strava";

const connectionCookie = "eotrainer_strava";
const flowCookie = "strava_oauth";
const flowSeconds = 600;
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/strava",
};

const connectionSchema = tokenSchema.extend({ credentials: credentialsSchema.optional() });
const flowSchema = z.object({
  state: z.string(),
  expires: z.number(),
  credentials: credentialsSchema.optional(),
});

export type StravaConnection = z.infer<typeof connectionSchema>;

export function stravaOrigin() {
  const { APP_URL, VERCEL_PROJECT_PRODUCTION_URL } = process.env;
  const value = APP_URL || (VERCEL_PROJECT_PRODUCTION_URL && `https://${VERCEL_PROJECT_PRODUCTION_URL}`);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.origin;
    if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return url.origin;
  } catch {}
  return null;
}

export function stravaConfiguration() {
  const origin = stravaOrigin();
  if (!origin) return { error: "L’adresse de MyTrainer n’est pas configurée sur le serveur (APP_URL)." } as const;
  if (!hasEncryptionKey()) return { error: "La clé de chiffrement du serveur (TOKEN_ENCRYPTION_KEY) est absente ou invalide." } as const;
  return { origin } as const;
}

export function isSameOrigin(req: Request, origin = stravaOrigin()) {
  return origin !== null && req.headers.get("origin") === origin;
}

export function readConnection(req: NextRequest) {
  const value = req.cookies.get(connectionCookie)?.value;
  if (!value) return null;
  try {
    return connectionSchema.parse(decrypt(value));
  } catch {
    return null;
  }
}

export function saveConnection(response: NextResponse, connection: StravaConnection) {
  response.cookies.set(connectionCookie, encrypt(connectionSchema.parse(connection)), {...options, maxAge: 180 * 86400});
}

export function clearConnection(response: NextResponse) {
  response.cookies.set(connectionCookie, "", {...options, maxAge: 0});
}

export function startFlow(response: NextResponse, flow: Omit<z.infer<typeof flowSchema>, "expires">) {
  response.cookies.set(flowCookie, encrypt({ ...flow, expires: Date.now() + flowSeconds * 1000 }), {...options, maxAge: flowSeconds});
}

export function readFlow(req: NextRequest) {
  const value = req.cookies.get(flowCookie)?.value;
  if (!value) return null;
  try {
    const flow = flowSchema.parse(decrypt(value));
    return flow.expires > Date.now() && flow.state === req.nextUrl.searchParams.get("state") ? flow : null;
  } catch {
    return null;
  }
}

export function clearFlow(response: NextResponse) {
  response.cookies.set(flowCookie, "", {...options, maxAge: 0});
}

export const noStore = { "Cache-Control": "no-store" };
