import { readTokens } from "@/lib/browser-strava";
export async function GET() { let connected = false; try {
    connected = !!await readTokens();
}
catch { } return Response.json({ connected }, { headers: { "Cache-Control": "no-store" } }); }
