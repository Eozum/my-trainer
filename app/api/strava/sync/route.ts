import { readTokens, saveTokens, requireOrigin } from "@/lib/browser-strava";
import { activities, exchange } from "@/lib/strava";
export const maxDuration = 60;
export async function POST(req: Request) { try {
    requireOrigin(req);
    let tokens = await readTokens();
    if (!tokens)
        return Response.json({ error: "Connectez Strava avant l’import." }, { status: 409 });
    if (tokens.expires_at < Date.now() / 1000 + 120) {
        tokens = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
        await saveTokens(tokens);
    }
    return Response.json({ activities: await activities(tokens.access_token) }, { headers: { "Cache-Control": "no-store" } });
}
catch {
    return Response.json({ error: "Import Strava impossible. Réessayez ou reconnectez Strava." }, { status: 400 });
} }
