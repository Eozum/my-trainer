import { NextResponse, type NextRequest } from "next/server";
import { noStore, readConnection, stravaConfiguration } from "@/lib/browser-strava";
import { serverCredentials } from "@/lib/strava";

export function GET(req: NextRequest) {
  const config = stravaConfiguration();
  return NextResponse.json({
    connected: !!readConnection(req),
    defaultConfigured: !!serverCredentials(),
    callbackDomain: config.origin ? new URL(config.origin).hostname : null,
    error: config.error,
  }, { headers: noStore });
}
