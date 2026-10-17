import { seal } from "@/lib/vault";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireOrigin } from "@/lib/browser-strava";
export async function POST(req: Request) { try {
    requireOrigin(req);
    if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET || !process.env.TOKEN_ENCRYPTION_KEY || !process.env.APP_URL)
        return Response.json({ error: "Strava non configuré." }, { status: 503 });
    const state = randomBytes(32).toString("base64url");
    (await cookies()).set("strava_oauth", seal(JSON.stringify({ state, expires: Date.now() + 600000 })), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/api/strava" });
    const url = new URL("https://www.strava.com/oauth/authorize");
    url.search = new URLSearchParams({ client_id: process.env.STRAVA_CLIENT_ID, redirect_uri: new URL("/api/strava/callback", process.env.APP_URL).toString(), response_type: "code", approval_prompt: "auto", scope: "read,activity:read_all", state }).toString();
    return Response.json({ url: url.toString() });
}
catch {
    return Response.json({ error: "Connexion Strava impossible." }, { status: 400 });
} }
