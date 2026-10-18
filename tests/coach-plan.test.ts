import {test} from "node:test";
import assert from "node:assert/strict";
import {coachContext, validateSuggestion, applySuggestion, stateHash} from "../lib/coach-plan";
import {generate} from "../lib/planner";
import {addDays, type State} from "../lib/model";
import {proposeWithOpenAI} from "../lib/coach-openai";
const today="2026-10-18";
const state:State={race:{name:"private race name",date:"2026-12-20",distance:21,elevation:500,terrain:"trail",goal:"finish",targetMinutes:150,weeklyKm:25,days:3},planStart:today,activities:[],sessions:[]};
const id="00000000-0000-4000-8000-000000000001";
const suggestion=(s=state)=>({explanation:"Garder de la régularité.",sessions:coachContext(s,today).targets.map(({date,kind,km,minutes,elevation,note})=>({date,kind,km,minutes,elevation,note}))});
test("context excludes known Strava data, names and notes and restricts horizon",()=>{
 const input={...state,activities:[{id:"strava:secret-id",name:"secret Strava name",date:today,distance:90,minutes:600,elevation:5000},{id:"manual",name:"private name",date:today,distance:8,minutes:50,elevation:20}]};
 const context=coachContext(input,today);assert.equal(context.input.history.runs,1);assert.equal(context.input.history.km,8);
 const text=JSON.stringify(context.input);for(const name of ["private race name","secret Strava name","private name","strava:secret-id"])assert.ok(!text.includes(name));
 assert.ok(context.targets.every(s=>s.date>today&&s.date<=addDays(today,14)&&s.date<state.race.date));
 assert.equal(JSON.stringify(coachContext({...input,activities:input.activities.slice(1)},today)),JSON.stringify(context));
});
test("validation rejects injected dates, duplicates, increased load and intensity",()=>{
 const base=suggestion();const targets=coachContext(state,today).targets;
 assert.doesNotThrow(()=>validateSuggestion(base,targets));
 for(const change of [{date:"2099-01-01"},{km:200},{minutes:3000},{minutes:1},{elevation:15000},{kind:"Tempo contrôlé"}]){
  const candidate=structuredClone(base);candidate.sessions[0]={...candidate.sessions[0],...change};assert.throws(()=>validateSuggestion(candidate,targets));
 }
 const repeated=structuredClone(base);repeated.sessions[1]=repeated.sessions[0];assert.throws(()=>validateSuggestion(repeated,targets));
});
test("application preserves historical, completed and outside-horizon sessions",()=>{
 const planned=generate(state,today).sessions;const past={id:"past",date:"2026-10-17",kind:"Easy",km:5,minutes:30,elevation:0,note:"old",status:"done" as const};
 const completed={...planned.find(s=>s.date>today)!,status:"done" as const};
 const outside={...planned.find(s=>s.date>addDays(today,14))!,note:"keep me",km:3};
 const before={...state,sessions:[past,completed,outside]};
 const result=applySuggestion(before,suggestion(before),id,today);
 assert.deepEqual(result.sessions.find(s=>s.id===past.id),past);assert.deepEqual(result.sessions.find(s=>s.id===completed.id),completed);assert.deepEqual(result.sessions.find(s=>s.id===outside.id),outside);
 assert.equal(result.coachPlanId,id);assert.equal(stateHash(result),stateHash(structuredClone(result)));
 assert.deepEqual(generate(result,today).sessions,result.sessions);
 assert.notEqual(stateHash(result),stateHash(before));
});
test("OpenAI structured response is validated and refusals/failures do not become plans",async()=>{
 const original=globalThis.fetch;const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="test-only";
 try {
  globalThis.fetch=async(url,options)=>{assert.equal(url,"https://api.openai.com/v1/responses");const payload=JSON.parse(String(options?.body));assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(suggestion())}]}]});};
  assert.deepEqual(await proposeWithOpenAI(state,today),suggestion());
  globalThis.fetch=async()=>Response.json({status:"completed",output:[{type:"message",content:[{type:"refusal",refusal:"No"}]}]});await assert.rejects(()=>proposeWithOpenAI(state,today));
  globalThis.fetch=async()=>new Response(null,{status:429});await assert.rejects(()=>proposeWithOpenAI(state,today));
  globalThis.fetch=async()=>Response.json({status:"incomplete",output:[]});await assert.rejects(()=>proposeWithOpenAI(state,today));
 }finally{globalThis.fetch=original;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});

test("overdue planned sessions reduce the reference before requesting a proposal",()=>{
 const past={id:"overdue",date:"2026-10-17",kind:"Endurance facile",km:5,minutes:35,elevation:0,note:"private note",status:"planned" as const};
 const normal=coachContext(state,today);const missed=coachContext({...state,sessions:[past]},today);
 assert.ok(missed.targets.reduce((sum,s)=>sum+s.km,0)<normal.targets.reduce((sum,s)=>sum+s.km,0));
 assert.ok(!JSON.stringify(missed.input).includes("private note"));
});
