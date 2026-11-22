import { type NextRequest, type NextResponse } from "next/server";
import { z } from "zod";
import { appOrigin } from "./browser-origin";
export { isSameOrigin, noStore } from "./browser-origin";
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

export function stravaConfiguration() {
  const origin = appOrigin();
  if (!origin) return { error: "L’adresse de MyTrainer n’est pas configurée sur le serveur (APP_URL)." } as const;
  if (!hasEncryptionKey()) return { error: "La clé de chiffrement du serveur (TOKEN_ENCRYPTION_KEY) est absente ou invalide." } as const;
  return { origin } as const;
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

