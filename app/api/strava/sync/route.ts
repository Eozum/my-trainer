import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, noStore, readConnection, saveConnection, type StravaConnection } from "@/lib/browser-strava";
import { activities, exchange, serverCredentials } from "@/lib/strava";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403, headers: noStore });
  }

  const connection = readConnection(req);
  if (!connection) {
    return NextResponse.json({ error: "Connecte Strava avant l’import." }, { status: 409, headers: noStore });
  }

  let refreshed: StravaConnection | undefined;
  let response: NextResponse;
  try {
    if (connection.expires_at < Date.now() / 1000 + 120) {
      const credentials = connection.credentials ?? serverCredentials();
      if (!credentials) throw Error("Missing Strava credentials");
      const tokens = await exchange({ grant_type: "refresh_token", refresh_token: connection.refresh_token }, credentials);
      refreshed = { ...tokens, credentials: connection.credentials };
    }
    response = NextResponse.json({ activities: await activities((refreshed ?? connection).access_token) }, { headers: noStore });
  } catch {
    response = NextResponse.json({
      error: "Import Strava impossible. Réessaie ou reconnecte Strava.",
    }, { status: 502, headers: noStore });
  }

  // Strava peut avoir renouvelé le jeton avant un échec de récupération des activités.
  if (refreshed) saveConnection(response, refreshed);
  return response;
}
