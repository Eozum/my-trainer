import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, noStore, readConnection, refreshStravaConnection, saveConnection, type StravaConnection } from "@/lib/browser-strava";
import { providerActivityId, routePoints } from "@/lib/route-points";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403, headers: noStore });
  const id = providerActivityId(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Identifiant d’activité Strava invalide." }, { status: 400, headers: noStore });
  const connection = readConnection(req);
  if (!connection) {
    return NextResponse.json({ error: "Reconnecte Strava depuis « Mes sorties » pour charger le tracé." }, { status: 409, headers: noStore });
  }

  let refreshed: StravaConnection | null = null;
  let result: NextResponse;
  try {
    refreshed = await refreshStravaConnection(connection);
    const upstream = await fetch(`https://www.strava.com/api/v3/activities/${id}/streams?keys=latlng&key_by_type=true`, {
      headers: { Authorization: `Bearer ${(refreshed ?? connection).access_token}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    });
    if (upstream.status === 404 || upstream.status === 204) {
      result = NextResponse.json({ points: [] }, { headers: noStore });
    } else {
      if (!upstream.ok) throw Error();
      const streams = await upstream.json();
      result = NextResponse.json({ points: routePoints(streams?.latlng?.data) }, { headers: noStore });
    }
  } catch {
    result = NextResponse.json({ error: "Le tracé Strava est indisponible. Réessaie ou reconnecte Strava." }, { status: 502, headers: noStore });
  }
  if (refreshed) saveConnection(result, refreshed);
  return result;
}
