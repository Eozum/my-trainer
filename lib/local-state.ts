import {activitySchema, day, stateSchema, type Activity, type State} from "./model";
import {generate} from "./planner";

export const STORAGE_KEY = "eotrainer.state.v1";

export function restoreState(raw: string): State {
  return stateSchema.parse(JSON.parse(raw));
}

export function importActivities(state: State, values: unknown): State {
  const activities = activitySchema.array().max(1000).parse(values);
  if (activities.some(activity => activity.date > day())) {
    throw Error("Une activité ne peut pas être future.");
  }
  const merged: Activity[] = [...new Map(
    [...state.activities, ...activities].map(activity => [activity.id, activity]),
  ).values()];
  const next = stateSchema.parse({
    ...state,
    activities: merged,
    sessions: state.sessions.map(session => activities.some(activity => activity.date === session.date)
      ? {...session, status: "done"} : session),
  });
  return {...next, sessions: generate(next).sessions};
}
