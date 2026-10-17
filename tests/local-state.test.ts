import {test} from "node:test";
import assert from "node:assert/strict";
import {restoreState,importActivities} from "../lib/local-state";
import {day,defaultRace,type State} from "../lib/model";
import {generate} from "../lib/planner";
const state:State={planStart:day(),race:defaultRace,activities:[],sessions:[]};
test("saved browser state round-trips and rejects malformed storage",()=>{
 assert.deepEqual(restoreState(JSON.stringify(state)),state);
 assert.throws(()=>restoreState('{"race":{}}'));
 assert.throws(()=>restoreState('broken'));
});
test("repeated imports deduplicate and mark matching sessions complete",()=>{
 const sessions=generate(state).sessions;
 // Use a past session: future imports are deliberately rejected.
 const past={...sessions[0],date:day(),status:"planned" as const};
 const initial={...state,sessions:[past]};
 const row={id:"strava:42",date:day(),distance:8,minutes:50,elevation:100};
 const first=importActivities(initial,[row]);
 const second=importActivities(first,[row]);
 assert.equal(second.activities.length,1);
 assert.equal(second.sessions.find(s=>s.id===past.id)?.status,"done");
 assert.equal(second.activities[0].distance,8);
});
test("future imports and oversized merged history leave state intact",()=>{
 assert.throws(()=>importActivities(state,[{id:"future",date:"2099-01-01",distance:8,minutes:50,elevation:0}]));
 const rows=Array.from({length:1000},(_,i)=>({id:`old:${i}`,date:day(),distance:8,minutes:50,elevation:0}));
 assert.throws(()=>importActivities({...state,activities:rows},[{...rows[0],id:"new"}]));
 assert.equal(state.activities.length,0);
});
