import {test} from "node:test";
import assert from "node:assert/strict";
import {activityBuckets,statistics,formatPace,formatDuration} from "../lib/statistics";
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

test("les graphiques alignent les intervalles et pondèrent l’allure par la distance", () => {
  const today = "2026-10-18";
  const rows = [run("premier", "2026-10-12", 2, 20), run("même-jour", "2026-10-12", 8, 40), run("dernier", today), run("futur", "2026-10-19")];
  const daily = activityBuckets(rows, "7", today);
  assert.equal(daily.length, 7);
  assert.deepEqual(daily[0], {start: "2026-10-12", end: "2026-10-12", distance: 10, elevation: 200, minutes: 60, pace: 6});
  assert.equal(daily[1].pace, null);
  assert.equal(daily.at(-1)?.distance, 10);
  assert.equal(activityBuckets(rows, "30", today).reduce((sum, bucket) => sum + bucket.distance, 0), 20);
  assert.ok(activityBuckets([...rows, run("ancien", "2005-08-08")], "all", today).length <= 12);
});
