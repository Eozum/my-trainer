import {createHash} from "node:crypto";
import {z} from "zod";
import {addDays, day, stateSchema, type State, type Session} from "./model";
import {generate} from "./planner";

export const suggestionSchema = z.object({
  explanation: z.string().min(1).max(1600),
  sessions: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kind: z.enum(["Endurance facile", "Sortie longue", "Tempo contrôlé", "Côtes en souplesse"]),
    km: z.number().min(1).max(200),
    minutes: z.number().min(1).max(3000),
    elevation: z.number().min(0).max(15000),
    note: z.string().min(1).max(700),
  }).strict()).min(1).max(10),
}).strict();
export type Suggestion = z.infer<typeof suggestionSchema>;

export function stateHash(state: State) {
  return createHash("sha256").update(JSON.stringify(stateSchema.parse(state))).digest("hex");
}

export function coachContext(state: State, today = day()) {
  // Exclude known Strava activities from both history totals and reference volume.
  const activities = state.activities.filter(a => !a.id.startsWith("strava:") && a.date >= addDays(today, -28) && a.date <= today);
  const safeState: State = {
    race: state.race, planStart: state.planStart, activities,
    sessions: state.sessions.filter(s => s.status === "missed" || (s.status === "planned" && s.date < today)),
  };
  const baseline = generate(safeState, today);
  const datesAlreadyHandled = new Set(state.sessions.filter(s => s.status !== "planned").map(s => s.date));
  const targets = baseline.sessions.filter(s => s.date > today && s.date <= addDays(today, 14)
    && s.date < state.race.date && !datesAlreadyHandled.has(s.date));
  const {name: _name, ...race} = state.race;
  return {
    targets,
    input: {
      today, race,
      history: {runs: activities.length, km: activities.reduce((sum, a) => sum + a.distance, 0), minutes: activities.reduce((sum, a) => sum + a.minutes, 0)},
      schedule: targets.map(({date, kind, km, minutes, elevation}) => ({date, kind, km, minutes, elevation})),
    },
  };
}

export function validateSuggestion(value: unknown, targets: Session[]): Suggestion {
  const suggestion = suggestionSchema.parse(value);
  if (suggestion.sessions.length !== targets.length) throw Error("Le programme doit conserver les jours disponibles.");
  const seen = new Set<string>();
  for (const session of suggestion.sessions) {
    const reference = targets.find(target => target.date === session.date);
    if (!reference || seen.has(session.date)) throw Error("Date ajoutée ou dupliquée.");
    seen.add(session.date);
    if (session.km > reference.km || session.km < reference.km * .5
      || session.minutes > reference.minutes * 1.25 || session.minutes < reference.minutes * .5
      || session.elevation > reference.elevation
      || session.minutes / session.km < reference.minutes / reference.km) throw Error("La proposition dépasse les limites du programme.");
    if (session.kind !== reference.kind && session.kind !== "Endurance facile") throw Error("Intensité supplémentaire interdite.");
  }
  return {...suggestion, sessions: suggestion.sessions.slice().sort((a, b) => a.date.localeCompare(b.date))};
}

export function applySuggestion(state: State, suggestion: unknown, proposalId: string, today = day()): State {
  const {targets} = coachContext(state, today);
  const checked = validateSuggestion(suggestion, targets);
  // Keep every historical/explicit session; only the targeted planned dates are replaced.
  const generated = generate({...state, coachPlanId: undefined}, today).sessions;
  const existingDates = new Set(state.sessions.map(session => session.date));
  const baseline = [...state.sessions, ...generated.filter(session => !existingDates.has(session.date))];
  const byDate = new Map(checked.sessions.map(session => [session.date, session]));
  return stateSchema.parse({...state, coachPlanId: proposalId, sessions: baseline.map(session => {
    const replacement = byDate.get(session.date);
    return replacement && session.status === "planned" ? {...replacement, id: session.id, status: "planned"} : session;
  }).sort((a, b) => a.date.localeCompare(b.date))});
}
