import { clearTokens, requireOrigin } from "@/lib/browser-strava";
export async function POST(req: Request) { try {
    requireOrigin(req);
    await clearTokens();
    return Response.json({ ok: true });
}
catch {
    return Response.json({ error: "Déconnexion impossible" }, { status: 400 });
} }
