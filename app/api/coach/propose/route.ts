import {randomUUID} from "node:crypto";
import {z} from "zod";
import {requireCoach} from "@/lib/coach-access";
import {coachFailure, CoachError, jsonBody} from "@/lib/coach-http";
import {loadNotebook, reserveGeneration, storeProposal} from "@/lib/coach-store";
import {applySuggestion, coachContext, stateHash} from "@/lib/coach-plan";
import {proposeWithOpenAI} from "@/lib/coach-openai";
import {day} from "@/lib/model";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    await requireCoach(req);
    const {revision} = z.object({revision: z.number().int().positive()}).strict().parse(await jsonBody(req, 1024));
    const notebook = await loadNotebook();
    if (!notebook.data || notebook.revision !== revision) throw new CoachError(409, "Le carnet a changé. Recharge la sauvegarde.");
    if (!process.env.OPENAI_API_KEY) throw new CoachError(503, "Configuration OpenAI manquante.");
    const today = day();
    if (!coachContext(notebook.data, today).targets.length) throw new CoachError(400, "Aucune séance à adapter dans les 14 prochains jours.");
    await reserveGeneration(revision);
    const suggestion = await proposeWithOpenAI(notebook.data, today);
    if (day() !== today) throw new CoachError(409, "La journée a changé. Demande une nouvelle adaptation.");
    const id = randomUUID();
    const proposed = applySuggestion(notebook.data, suggestion, id, today);
    const sourceHash = stateHash(notebook.data);
    await storeProposal({id, source_revision: revision, source_hash: sourceHash, proposed_state: proposed, explanation: suggestion.explanation});
    return Response.json({id, sourceHash, explanation: suggestion.explanation, sessions: suggestion.sessions}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {return coachFailure(error);}
}
