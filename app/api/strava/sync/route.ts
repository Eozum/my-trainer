import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, noStore, readConnection, refreshStravaConnection, saveConnection, type StravaConnection } from "@/lib/browser-strava";
import { activities } from "@/lib/strava";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403, headers: noStore });
  }

  const connection = readConnection(req);
  if (!connection) {
    return NextResponse.json({ error: "Connecte Strava avant l’import." }, { status: 409, headers: noStore });
  }

  let refreshed: StravaConnection | null = null;
  let response: NextResponse;
  try {
    refreshed = await refreshStravaConnection(connection);
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
