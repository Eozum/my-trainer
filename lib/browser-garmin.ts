import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, isSameOrigin, noStore } from "./browser-origin";
import { GarminError, garminKeySchema } from "./garmin";
import { decrypt, encrypt, hasEncryptionKey } from "./vault";

const name = "eotrainer_garmin";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/garmin",
};

export function garminSetupError() {
  if (!appOrigin()) return "L’adresse de MyTrainer n’est pas configurée sur le serveur (APP_URL).";
  if (!hasEncryptionKey()) return "La clé de chiffrement du serveur (TOKEN_ENCRYPTION_KEY) est absente ou invalide.";
  return null;
}

export function requireGarminOrigin(req: Request) {
  const origin = appOrigin();
  if (!origin) throw new GarminError(503, "L’adresse de MyTrainer n’est pas configurée sur le serveur (APP_URL).");
  if (!isSameOrigin(req, origin)) {
    throw new GarminError(403, `Ouvre MyTrainer à l’adresse ${origin} pour utiliser Garmin.`);
  }
}

export function garminFailure(error: unknown) {
  if (error instanceof GarminError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
  }
  return NextResponse.json({ error: "Impossible de joindre Garmin Connect. Réessaie dans quelques instants." }, { status: 502, headers: noStore });
}

export function readGarminKey(req: NextRequest) {
  const value = req.cookies.get(name)?.value;
  if (!value) return null;
  try {
    return garminKeySchema.parse(decrypt(value));
  } catch {
    return null;
  }
}

export function saveGarminKey(response: NextResponse, key: string) {
  response.cookies.set(name, encrypt(key), { ...cookieOptions, maxAge: 365 * 86400 });
}

export function clearGarminKey(response: NextResponse) {
  response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
}
