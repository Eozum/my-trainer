import {test} from "node:test";
import assert from "node:assert/strict";
import {statistics,formatPace,formatDuration} from "../lib/statistics";
const run=(id:string,date:string,distance=10,minutes=60)=>({id,date,distance,minutes,elevation:100});
test("period includes today and the first day, excludes older and future runs",()=>{
 const rows=[run("old","2026-10-11"),run("first","2026-10-12"),run("today","2026-10-18"),run("future","2026-10-19")];
 const result=statistics(rows,"7","2026-10-18");
 assert.deepEqual(result.activities.map(a=>a.id),["today","first"]);
 assert.equal(result.distance,20);assert.equal(result.elevation,200);
 assert.equal(statistics(rows,"all","2026-10-18").count,3);
 assert.equal(rows[0].id,"old");
});
test("pace is distance-weighted and average distance uses run count",()=>{
 const result=statistics([run("short","2026-10-18",2,20),run("long","2026-10-17",10,50)],"30","2026-10-18");
 assert.equal(result.averageDistance,6);assert.equal(result.pace,70/12);assert.equal(formatPace(result.pace),"5:50");assert.equal(result.minutes,70);
});
test("empty history has no fabricated average and pace rounding carries minutes",()=>{
 const result=statistics([],"30","2026-10-18");assert.equal(result.averageDistance,null);assert.equal(result.pace,null);assert.equal(result.distance,0);
 assert.equal(formatPace(null),"—");assert.equal(formatPace(5.999),"6:00");assert.equal(formatDuration(119.9),"2 h 00");
});
test("30-day window handles month boundaries",()=>{
 assert.equal(statistics([run("before","2026-09-18"),run("start","2026-09-19")],"30","2026-10-18").count,1);
});
