import { NextResponse, type NextRequest } from "next/server";
import { noStore } from "@/lib/browser-origin";
import { clearGarminKey, garminFailure, garminSetupError, readGarminKey, requireGarminOrigin, saveGarminKey } from "@/lib/browser-garmin";
import { jsonBody } from "@/lib/coach-http";
import { GarminError, garminKeySchema, garminToken } from "@/lib/garmin";
import { z } from "zod";

const setupSchema = z.object({ key: garminKeySchema });

export function GET(req: NextRequest) {
  return NextResponse.json({
    connected: !!readGarminKey(req),
    error: garminSetupError(),
  }, { headers: noStore });
}

export async function POST(req: Request) {
  try {
    requireGarminOrigin(req);
    const error = garminSetupError();
    if (error) throw new GarminError(503, error);

    let key: string;
    try {
      ({ key } = setupSchema.parse(await jsonBody(req, 2048)));
    } catch {
      throw new GarminError(400, "Renseigne ta clé API personnelle Garmin.");
    }

    await garminToken(key);
    const response = NextResponse.json({ connected: true }, { headers: noStore });
    saveGarminKey(response, key);
    return response;
  } catch (error) {
    return garminFailure(error);
  }
}

export function DELETE(req: Request) {
  try {
    requireGarminOrigin(req);
    const response = NextResponse.json({ connected: false }, { headers: noStore });
    clearGarminKey(response);
    return response;
  } catch (error) {
    return garminFailure(error);
  }
}
