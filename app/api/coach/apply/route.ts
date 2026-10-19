import {z} from "zod";
import {requireCoach} from "@/lib/coach-access";
import {coachFailure, jsonBody} from "@/lib/coach-http";
import {applyProposal} from "@/lib/coach-store";
export async function POST(req: Request) {
  try {
    await requireCoach(req);
    const {id} = z.object({id: z.string().uuid()}).strict().parse(await jsonBody(req, 1024));
    return Response.json(await applyProposal(id), {headers: {"Cache-Control": "no-store"}});
  } catch (error) {return coachFailure(error);}
}
