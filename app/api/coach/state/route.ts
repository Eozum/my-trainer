import {z} from "zod";
import {stateSchema} from "@/lib/model";
import {requireCoach} from "@/lib/coach-access";
import {coachFailure, CoachError, jsonBody} from "@/lib/coach-http";
import {loadNotebook, saveNotebook} from "@/lib/coach-store";
export async function GET() {
  try {await requireCoach(); return Response.json(await loadNotebook(), {headers: {"Cache-Control": "no-store"}});}
  catch (error) {return coachFailure(error);}
}
export async function PUT(req: Request) {
  try {
    await requireCoach(req);
    const {state, revision} = z.object({state: stateSchema, revision: z.number().int().nonnegative()}).strict().parse(await jsonBody(req));
    if (new Set(state.sessions.map(s => s.id)).size !== state.sessions.length || new Set(state.sessions.map(s => s.date)).size !== state.sessions.length) throw new CoachError(400, "Une seule séance par jour est autorisée, avec des identifiants uniques.");
    return Response.json({revision: await saveNotebook(state, revision)});
  } catch (error) {return coachFailure(error);}
}
