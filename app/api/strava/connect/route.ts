import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isSameOrigin, noStore, startFlow, stravaConfiguration } from "@/lib/browser-strava";
import { credentialsSchema, serverCredentials, type StravaCredentials } from "@/lib/strava";
import { jsonBody } from "@/lib/coach-http";

export async function POST(req: Request) {
  const config = stravaConfiguration();
  if (!config.origin) return NextResponse.json({ error: config.error }, { status: 503, headers: noStore });
  if (!isSameOrigin(req, config.origin)) {
    return NextResponse.json({ error: `Ouvre MyTrainer à l’adresse ${config.origin} pour connecter Strava.` }, { status: 403, headers: noStore });
  }

  let credentials: StravaCredentials | undefined;
  if (req.body) {
    try {
      credentials = credentialsSchema.parse(await jsonBody(req, 2048));
    } catch {
      return NextResponse.json({ error: "Vérifie le Client ID et le Client Secret de ton application Strava." }, { status: 400, headers: noStore });
    }
  }

  const clientId = (credentials ?? serverCredentials())?.clientId;
  if (!clientId) {
    return NextResponse.json({
      error: "Renseigne le Client ID et le Client Secret de ton application Strava.",
      setupRequired: true,
    }, { status: 409, headers: noStore });
  }

  const state = randomBytes(32).toString("base64url");
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: new URL("/api/strava/callback", config.origin).href,
    response_type: "code",
    approval_prompt: "force",
    scope: "read,activity:read_all",
    state,
  }).toString();

  const response = NextResponse.json({ url: url.href }, { headers: noStore });
  startFlow(response, { state, credentials });
  return response;
}
