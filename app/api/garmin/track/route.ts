import { NextResponse, type NextRequest } from "next/server";
import { noStore } from "@/lib/browser-origin";
import { garminFailure, readGarminKey, requireGarminOrigin } from "@/lib/browser-garmin";
import { GarminError } from "@/lib/garmin";
import { garminTrack } from "@/lib/garmin-track";
import { providerActivityId } from "@/lib/route-points";

export async function POST(req: NextRequest) {
  try {
    requireGarminOrigin(req);
    const id = providerActivityId(req.nextUrl.searchParams.get("id"));
    if (!id) throw new GarminError(400, "Identifiant d’activité Garmin invalide.");
    const key = readGarminKey(req);
    if (!key) throw new GarminError(409, "Reconnecte Garmin depuis « Mes sorties » pour charger le tracé.");
    return NextResponse.json({ points: await garminTrack(id, key) }, { headers: noStore });
  } catch (error) {
    return garminFailure(error);
  }
}
