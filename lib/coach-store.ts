import {z} from "zod";
import {stateSchema, type State} from "./model";
import {CoachError} from "./coach-http";

async function database(path: string, method = "GET", body?: unknown) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || new URL(url).protocol !== "https:") throw new CoachError(503, "Configuration Supabase manquante.");
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: {apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation"},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error.message === "COACH_CONFLICT") throw new CoachError(409, "Le carnet a changé. Recharge la sauvegarde avant de réessayer.");
    if (error.message === "COACH_RATE_LIMIT") throw new CoachError(429, "Limite atteinte : une proposition par minute et dix par jour.");
    if (error.message === "COACH_EXPIRED") throw new CoachError(409, "Cette proposition a expiré. Demande une nouvelle adaptation.");
    throw new CoachError(502, "La sauvegarde Supabase est indisponible. Vérifie la migration et la configuration.");
  }
  return response.status === 204 ? null : response.json();
}
const notebookSchema = z.object({revision: z.number().int().positive(), data: stateSchema});
export async function loadNotebook() {
  const rows = await database("coach_notebooks?id=eq.personal&select=revision,data");
  return rows.length ? notebookSchema.parse(rows[0]) : {revision: 0, data: null};
}
export async function saveNotebook(state: State, revision: number) {
  return z.number().int().positive().parse(await database("rpc/save_coach_notebook", "POST", {p_data: state, p_revision: revision}));
}
export async function reserveGeneration(revision: number) {
  await database("rpc/reserve_coach_generation", "POST", {p_revision: revision});
}
export async function storeProposal(proposal: {id: string; source_revision: number; source_hash: string; proposed_state: State; explanation: string}) {
  await database("coach_plan_versions", "POST", {...proposal, notebook_id: "personal"});
}
export async function applyProposal(id: string) {
  const result = await database("rpc/apply_coach_proposal", "POST", {p_id: id});
  return notebookSchema.parse(result);
}
