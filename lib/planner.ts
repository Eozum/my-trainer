import { addDays, day, type Race, type Session, type State } from "./model";
import { formatPace } from "./statistics";

const weekDays: Record<number, number[]> = { 2: [2, 6], 3: [1, 3, 6], 4: [1, 3, 5, 6], 5: [0, 1, 3, 5, 6] };
const goals: Record<Race["goal"], { volume: number; longShare: number; description: string }> = {
  finish: { volume: .9, longShare: .42, description: "Finir · priorité à l’endurance et aux sorties longues faciles." },
  progress: { volume: 1, longShare: .38, description: "Progresser · endurance et travail soutenu progressif, selon le terrain." },
  time: { volume: 1, longShare: .38, description: "Viser un chrono · séances spécifiques quand le volume et le temps de préparation le permettent." },
};

const roundKm = (km: number) => Math.round(km * 10) / 10;
const daysBetween = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 86400000);

function qualitySession(race: Race, specific: boolean, minutes: number, pace: number | null) {
  const hills = race.terrain !== "route";
  const warmup = Math.min(15, Math.floor(minutes * .3));
  const coolDown = Math.min(10, Math.floor(minutes * .25));
  const block = minutes - warmup - coolDown;
  const preferred = specific && race.goal === "time" ? 5 : hills ? 2 : 3;
  const repetitions = Math.min(specific ? 4 : 3, Math.floor((block + 2) / (preferred + 2)));
  if (warmup < 8 || coolDown < 5 || repetitions < 2) return null;
  const intensity = pace === null
    ? (hills ? "en côte à effort soutenu et régulier" : "à effort soutenu et régulier")
    : `autour de ${formatPace(pace)} min/km`;
  return {
    kind: hills ? "Côtes en souplesse" : "Tempo contrôlé",
    note: `${warmup} min faciles, puis ${repetitions} × ${preferred} min ${intensity}, avec 2 min faciles entre les répétitions. Termine en endurance, dont ${coolDown} min de retour au calme.`,
  };
}

export function generate(state: State, today = day()) {
  const { race, activities } = state;
  const days = daysBetween(today, race.date);
  if (days < 1 || days > 365) throw Error("Choisis une course dans les 365 prochains jours.");

  const recent = activities.filter(activity => activity.date > addDays(today, -28) && activity.date <= today);
  const recentKm = recent.reduce((sum, activity) => sum + activity.distance, 0);
  const weeklyObserved = recentKm / 4;
  const base = recent.length >= 4 ? Math.max(5, Math.min(race.weeklyKm, weeklyObserved)) : race.weeklyKm;
  const pace = recentKm ? Math.max(4, Math.min(12, recent.reduce((sum, activity) => sum + activity.minutes, 0) / recentKm)) : 7;
  const longest = Math.max(0, ...recent.map(activity => activity.distance));
  const old = state.sessions.map(session => session.date < today && session.status === "planned"
    ? { ...session, status: "missed" as const }
    : session);
  const recentSessions = old.filter(session => session.date >= addDays(today, -14) && session.date < today);
  const missed = recentSessions.filter(session => session.status === "missed").length;
  const completed = recentSessions.filter(session => session.status === "done").length;
  const factor = Math.max(.6, 1 - missed * .12);
  const adjustedBase = roundKm(base * factor);
  const goal = goals[race.goal];

  const anchor = state.planStart ?? today;
  const totalPreparation = daysBetween(anchor, race.date);
  const canBuildQuality = race.goal !== "finish" && race.days >= 3 && totalPreparation >= 28 && missed === 0 && base >= 15;
  const targetPace = race.targetMinutes / race.distance;
  const comparableRuns = recent.filter(activity => activity.distance >= Math.min(8, race.distance * .7));
  const reference = Math.min(...comparableRuns.map(activity => activity.minutes / activity.distance));
  const tempoPace = race.goal === "time" && race.terrain === "route" && canBuildQuality && days > 14 && targetPace >= 2.5
    && targetPace <= 15 && targetPace >= reference * .95 ? targetPace : null;

  const reasons = [
    goal.description,
    recent.length >= 4 ? `Historique sur 28 jours : ${weeklyObserved.toFixed(1)} km par semaine.` : "Volume hebdomadaire déclaré utilisé en raison de l’historique disponible.",
    missed ? `${missed} séance(s) manquée(s) sur 14 jours : volume réduit de ${Math.round((1 - factor) * 100)} %, sans rattrapage.`
      : "Progression du volume de référence plafonnée à 5 % par semaine, avec une semaine allégée toutes les quatre semaines.",
    "Volume réduit à l’approche de la course. La veille est réservée au repos.",
  ];
  if (days < 28) reasons.push("Préparation courte : priorité à la continuité.");
  if (race.goal === "time") reasons.push(tempoPace === null
    ? `Chrono visé : ${race.targetMinutes} min. Les consignes restent à l’effort.`
    : `Chrono visé : ${race.targetMinutes} min, soit ${formatPace(tempoPace)} min/km sur les fractions spécifiques.`);

  if (state.coachPlanId) {
    return { sessions: old, reasons: ["Programme validé avec l’IA. Sélectionne « Recalculer mon programme » pour reprendre le programme par objectif."], base: adjustedBase, completed, missed };
  }

  const slots = weekDays[race.days];
  const explicit = new Map(old.filter(session => session.status !== "planned").map(session => [session.date, session]));
  const sessions: Session[] = old.filter(session => session.date < today);
  for (let offset = 0; offset <= days; offset++) {
    const date = addDays(today, offset);
    const existing = explicit.get(date);
    if (existing) {
      sessions.push(existing);
      continue;
    }
    const remaining = days - offset;
    if (remaining === 0) {
      sessions.push({
        id: date, date, kind: "Course cible", km: race.distance, minutes: race.targetMinutes, elevation: race.elevation, status: "planned",
        note: race.goal === "time" && tempoPace !== null
          ? `Allure moyenne visée : ${formatPace(tempoPace)} min/km. Adapte le départ aux sensations et aux conditions.`
          : "Départ prudent, gestion à l’effort.",
      });
      continue;
    }

    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    if (!slots.includes(weekday) || remaining === 1) continue;

    const week = Math.max(0, Math.floor(daysBetween(anchor, date) / 7));
    const progression = Math.pow(1.05, Math.min(week, 8));
    const taper = remaining <= 7 ? .5 : remaining <= 14 ? .75 : 1;
    const volume = adjustedBase * goal.volume * progression * (week % 4 === 3 ? .8 : 1) * taper;
    const long = weekday === 6;
    const specific = remaining <= 42 && week >= 1;
    const longShare = race.days === 2 ? .53 : goal.longShare;
    const share = long ? longShare : (1 - longShare) / (race.days - 1);
    const desiredKm = Math.max(1, volume * share);
    const longLimit = longest > 0 ? Math.max(adjustedBase * longShare, longest * 1.05) * progression : desiredKm;
    const km = roundKm(long ? Math.min(desiredKm, longLimit) : desiredKm);
    const minutes = Math.round(km * pace * 1.08);
    const quality = canBuildQuality && weekday === 3 && remaining > 14
      ? qualitySession(race, specific, minutes, specific ? tempoPace : null)
      : null;
    const trailRatio = Math.min(race.elevation / race.distance, 120) * (quality ? .75 : long ? .6 : .35);

    sessions.push({
      id: date, date, km, minutes, status: "planned",
      kind: quality?.kind ?? (long ? "Sortie longue" : "Endurance facile"),
      elevation: race.terrain === "route" ? 0 : Math.round(km * trailRatio),
      note: quality?.note ?? (long && race.terrain !== "route"
        ? "Reste en aisance respiratoire et marche dans les pentes si besoin."
        : "Cours à une intensité qui te permet de tenir une conversation."),
    });
  }
  return { sessions, reasons, base: adjustedBase, completed, missed };
}
