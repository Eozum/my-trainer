import {z} from "zod";
import {requireCoach, sameOrigin, validAccessKey, unlock, lock} from "@/lib/coach-access";
import {coachFailure, CoachError, jsonBody} from "@/lib/coach-http";
export async function GET() {
  try {await requireCoach(); return Response.json({unlocked: true}, {headers: {"Cache-Control": "no-store"}});}
  catch (error) {return coachFailure(error);}
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const {key} = z.object({key: z.string().min(1).max(256)}).strict().parse(await jsonBody(req, 1024));
    if (!validAccessKey(key)) throw new CoachError(401, "Clé privée incorrecte.");
    await unlock();
    return Response.json({ok: true}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {return coachFailure(error);}
}
export async function DELETE(req: Request) {
  try {sameOrigin(req); await lock(); return Response.json({ok: true});}
  catch (error) {return coachFailure(error);}
}
