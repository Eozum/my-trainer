import {test} from "node:test";import assert from "node:assert/strict";import {generate} from "../lib/planner";import {defaultRace,stateSchema,type State} from "../lib/model";
const today="2026-10-17";const seed=():State=>({race:{...defaultRace,date:"2026-12-12"},activities:[],sessions:[]});
test("deterministic bounded plan ends on race day",()=>{const p=generate(seed(),today);assert.deepEqual(p,generate(seed(),today));assert.equal(p.sessions.at(-1)?.date,"2026-12-12");assert.equal(p.sessions.at(-1)?.kind,"Course cible");assert.ok(p.sessions.every(s=>s.date>=today&&s.date<=seed().race.date));assert.equal(new Set(p.sessions.map(s=>s.id)).size,p.sessions.length);});
test("missed sessions reduce volume and preserve history",()=>{const s=seed(),p=generate(s,"2026-10-10");s.sessions=p.sessions;const adapted=generate(s,today);assert.ok(adapted.missed>0);assert.ok(adapted.base<generate(seed(),today).base);assert.ok(adapted.sessions.some(s=>s.date<today&&s.status==="missed"));});
test("recent history constrains self-reported volume",()=>{const s=seed();s.activities=[1,2,3,4].map(n=>({id:String(n),date:`2026-10-${10+n}`,distance:5,minutes:35,elevation:0}));assert.equal(generate(s,today).base,5);});
test("race deadline, invalid date, duplicate day and future completion boundaries",()=>{assert.throws(()=>generate({...seed(),race:{...seed().race,date:today}},today));assert.equal(stateSchema.safeParse({...seed(),race:{...seed().race,date:"2026-02-30"}}).success,false);});
test("taper reduces last week; done sessions stay unchanged",()=>{const s=seed();const p=generate(s,today);const first=p.sessions.filter(x=>x.date<"2026-10-24").reduce((a,x)=>a+x.km,0);const last=p.sessions.filter(x=>x.date>="2026-12-05"&&x.date<"2026-12-12").reduce((a,x)=>a+x.km,0);assert.ok(last<first);const done={...p.sessions[0],status:"done" as const};s.sessions=[done];assert.deepEqual(generate(s,today).sessions.find(x=>x.id===done.id),done);});

test("daily recalculation keeps the same progression anchor",()=>{const s={...seed(),planStart:today};const initial=generate(s,today);s.sessions=initial.sessions;const tomorrow=generate(s,"2026-10-18");assert.equal(initial.sessions.find(x=>x.date==="2026-10-25")?.km,tomorrow.sessions.find(x=>x.date==="2026-10-25")?.km);});

test("les objectifs changent le programme et le terrain change le contenu de la séance", () => {
  const s = seed();
  s.race = { ...s.race, days: 3, weeklyKm: 30, terrain: "route" };
  const finish = generate(s, today);
  const progress = generate({ ...s, race: { ...s.race, goal: "progress" } }, today);
  const trail = generate({ ...s, race: { ...s.race, goal: "progress", terrain: "trail", elevation: 900 } }, today);
  assert.ok(finish.sessions.every(session => session.kind !== "Tempo contrôlé"));
  assert.ok(progress.sessions.some(session => session.kind === "Tempo contrôlé"));
  assert.ok(trail.sessions.some(session => session.kind === "Côtes en souplesse" && session.elevation > 0));
  assert.ok(trail.sessions.filter(session => session.date >= "2026-11-28").every(session => session.kind !== "Côtes en souplesse"));
  assert.ok(trail.sessions.every(session => session.date !== "2026-12-11"));
});

test("une allure spécifique nécessite des sorties comparables et un objectif cohérent", () => {
  const s = seed();
  s.race = { ...s.race, goal: "time", terrain: "route", distance: 10, targetMinutes: 55, weeklyKm: 35, days: 3 };
  const noHistory = generate(s, today);
  assert.ok(noHistory.sessions.every(session => !session.note.includes("5:30")));
  s.activities = [{ id: "garmin:123", date: "2026-10-15", distance: 8, minutes: 45, elevation: 20 }];
  const supported = generate(s, today);
  assert.ok(supported.sessions.some(session => session.kind === "Tempo contrôlé" && session.note.includes("5:30")));
  const ambitious = generate({ ...s, race: { ...s.race, targetMinutes: 30 } }, today);
  assert.ok(ambitious.sessions.every(session => !session.note.includes("3:00")));
});
