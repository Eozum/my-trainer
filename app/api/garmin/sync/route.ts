import { NextResponse, type NextRequest } from "next/server";
import { noStore } from "@/lib/browser-origin";
import { garminFailure, garminSetupError, readGarminKey, requireGarminOrigin } from "@/lib/browser-garmin";
import { GarminError, garminActivities } from "@/lib/garmin";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    requireGarminOrigin(req);
    const error = garminSetupError();
    if (error) throw new GarminError(503, error);
    const key = readGarminKey(req);
    if (!key) throw new GarminError(409, "Connecte Garmin avant d’importer tes sorties.");
    const activities = await garminActivities(key);
    return NextResponse.json({ activities }, { headers: noStore });
  } catch (error) {
    return garminFailure(error);
  }
}
