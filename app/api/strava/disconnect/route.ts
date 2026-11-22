import { NextResponse } from "next/server";
import { clearConnection, clearFlow, isSameOrigin, noStore } from "@/lib/browser-strava";

export function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Origine non autorisée." }, { status: 403, headers: noStore });
  }
  const response = NextResponse.json({ ok: true }, { headers: noStore });
  clearConnection(response);
  clearFlow(response);
  return response;
}
