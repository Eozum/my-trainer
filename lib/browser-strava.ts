import {cookies} from "next/headers";
import {encrypt, decrypt} from "./vault";
import {tokenSchema, type Tokens} from "./strava";

const name = "eotrainer_strava";
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/strava",
};

export async function saveTokens(tokens: Tokens) {
  (await cookies()).set(name, encrypt(tokenSchema.parse(tokens)), {...options, maxAge: 180 * 86400});
}

export async function readTokens() {
  const value = (await cookies()).get(name)?.value;
  return value ? tokenSchema.parse(decrypt(value)) : null;
}

export async function clearTokens() {
  (await cookies()).delete({name, path: options.path});
}

// Mutations are available only to the application's own browser origin.
export function requireOrigin(req: Request) {
  if (!process.env.APP_URL || req.headers.get("origin") !== new URL(process.env.APP_URL).origin) {
    throw Error("Origine non autorisée");
  }
}
