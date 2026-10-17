import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { unseal } from "@/lib/vault";
import { saveTokens } from "@/lib/browser-strava";
import { exchange } from "@/lib/strava";
export async function GET(req: Request) { const jar = await cookies(), stored = jar.get("strava_oauth")?.value; jar.delete({ name: "strava_oauth", path: "/api/strava" }); const base = process.env.APP_URL; if (!base)
    return Response.json({ error: "Strava non configuré" }, { status: 503 }); try {
    if (!stored)
        throw Error();
    const flow = unseal(stored), url = new URL(req.url);
    if (flow.expires < Date.now() || url.searchParams.get("state") !== flow.state || !url.searchParams.get("code") || !url.searchParams.get("scope")?.split(",").includes("activity:read_all"))
        throw Error();
    const tokens = await exchange({ grant_type: "authorization_code", code: url.searchParams.get("code")! });
    await saveTokens(tokens);
    return NextResponse.redirect(new URL("/?strava=connected", base));
}
catch {
    return NextResponse.redirect(new URL("/?strava=error", base));
} }
