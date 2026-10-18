import {test} from "node:test";import assert from "node:assert/strict";import {normalizeActivity,tokenSchema} from "../lib/strava";
const row={id:42,sport_type:"TrailRun",start_date_local:"2026-10-17T23:30:00",distance:10500,moving_time:3600,total_elevation_gain:250};
test("Strava converts units, preserves local date and namespaces IDs",()=>{assert.deepEqual(normalizeActivity(row),{id:"strava:42",date:"2026-10-17",distance:10.5,minutes:60,elevation:250});});
test("non-running and empty activities are ignored",()=>{assert.equal(normalizeActivity({...row,sport_type:"Ride"}),null);assert.equal(normalizeActivity({...row,distance:0}),null);});
test("invalid activities and incomplete tokens are rejected",()=>{assert.throws(()=>normalizeActivity({...row,moving_time:-1}));assert.throws(()=>tokenSchema.parse({access_token:"a"}));});

test("activity import paginates and surfaces API failures",async()=>{
 const {activities}=await import("../lib/strava");const original=globalThis.fetch;const urls:string[]=[];
 try{globalThis.fetch=async(input,init)=>{urls.push(String(input));assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer private");return Response.json(urls.length===1?Array.from({length:100},(_,i)=>({...row,id:i+1})):[{...row,id:101}]);};const result=await activities("private");assert.equal(result.length,101);assert.match(urls[1],/page=2/);
 globalThis.fetch=async()=>new Response(null,{status:429});await assert.rejects(()=>activities("private"));
 }finally{globalThis.fetch=original;}
});
test("refresh exchange validates tokens and keeps credentials in request body",async()=>{
 const {exchange}=await import("../lib/strava");const original=globalThis.fetch;
 try{globalThis.fetch=async(input,init)=>{assert.equal(String(input),"https://www.strava.com/oauth/token");assert.equal((init?.body as URLSearchParams).get("grant_type"),"refresh_token");return Response.json({access_token:"new",refresh_token:"rotated",expires_at:2000000000});};assert.equal((await exchange({grant_type:"refresh_token",refresh_token:"old"})).refresh_token,"rotated");
 globalThis.fetch=async()=>Response.json({access_token:"incomplete"});await assert.rejects(()=>exchange({grant_type:"refresh_token",refresh_token:"old"}));
 }finally{globalThis.fetch=original;}
});
test("Strava preserves the run name for history without breaking older imports",()=>{assert.equal(normalizeActivity({...row,name:"Les bords de Loire"})?.name,"Les bords de Loire");assert.equal(normalizeActivity(row)?.name,undefined);});
