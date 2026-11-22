import { NextResponse, type NextRequest } from "next/server";
import { clearFlow, noStore, readFlow, saveConnection, stravaConfiguration } from "@/lib/browser-strava";
import { exchange, serverCredentials } from "@/lib/strava";

export async function GET(req: NextRequest) {
  const config = stravaConfiguration();
  if (!config.origin) return NextResponse.json({ error: config.error }, { status: 503, headers: noStore });

  const flow = readFlow(req);
  function back(result: string) {
    const response = NextResponse.redirect(new URL(`/?strava=${result}#strava`, config.origin));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    if (flow) clearFlow(response);
    return response;
  }

  if (!flow) return back("expired");
  const { searchParams } = req.nextUrl;
  if (searchParams.get("error") === "access_denied") return back("denied");
  const code = searchParams.get("code");
  if (!code || searchParams.has("error")) return back("error");
  const scopes = searchParams.get("scope")?.split(/[,\s]+/);
  if (!scopes?.includes("activity:read_all")) return back("scope");

  const credentials = flow.credentials ?? serverCredentials();
  if (!credentials) return back("error");
  try {
    const tokens = await exchange({ grant_type: "authorization_code", code }, credentials);
    const response = back("connected");
    saveConnection(response, { ...tokens, credentials: flow.credentials });
    return response;
  } catch {
    return back("error");
  }
}
