import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

// PGlite executes the actual PostgreSQL migration/functions, not a SQL mock.
test("private database migration, atomic approval, conflicts, limits and permissions",async()=>{
 const db=new PGlite();
 try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const sql=await readFile(new URL("../supabase/migrations/20261018_coach.sql",import.meta.url),"utf8");await db.exec(sql);await db.exec(sql);
  const state={race:{name:"Test"},activities:[{id:"a",date:"2026-10-17",distance:5,minutes:30,elevation:10}],sessions:[{id:"s",date:"2026-10-20",kind:"Endurance facile",km:5,minutes:30,elevation:0,note:"Facile",status:"planned"}]};
  const save=(revision:number,data=state)=>db.query<{revision:number}>("select public.save_coach_notebook($1::jsonb,$2) as revision",[JSON.stringify(data),revision]);
  assert.equal((await save(0)).rows[0].revision,1);
  await assert.rejects(()=>save(0),/COACH_CONFLICT/);
  assert.equal((await db.query("select * from public.training_sessions")).rows.length,1);
  await db.query("select public.reserve_coach_generation(1)");
  await assert.rejects(()=>db.query("select public.reserve_coach_generation(1)"),/COACH_RATE_LIMIT/);
  await db.exec("update public.coach_notebooks set last_generation_at=now()-interval '2 minutes',generation_count=10;");
  await assert.rejects(()=>db.query("select public.reserve_coach_generation(1)"),/COACH_RATE_LIMIT/);
  await db.exec("update public.coach_notebooks set generation_day=current_date-1,last_generation_at=now()-interval '2 minutes';");await db.query("select public.reserve_coach_generation(1)");
  const id="00000000-0000-4000-8000-000000000001";
  const proposed={...state,sessions:[{...state.sessions[0],km:4}]};
  await db.query("insert into public.coach_plan_versions(id,notebook_id,source_revision,source_hash,explanation,proposed_state) values ($1,'personal',1,'hash','Prudent',$2::jsonb)",[id,JSON.stringify(proposed)]);
  const applied=await db.query<{result:{revision:number;data:typeof state}}>("select public.apply_coach_proposal($1) as result",[id]);assert.equal(applied.rows[0].result.revision,2);assert.equal(applied.rows[0].result.data.sessions[0].km,4);
  assert.equal((await db.query<{km:string}>("select km from public.training_sessions")).rows[0].km,"4");
  const previous=await db.query<{previous_state:typeof state}>("select previous_state from public.coach_plan_versions where id=$1",[id]);assert.deepEqual(previous.rows[0].previous_state,state);
  await assert.rejects(()=>db.query("select public.apply_coach_proposal($1)",[id]),/COACH_CONFLICT/);
  const stale="00000000-0000-4000-8000-000000000002";
  await db.query("insert into public.coach_plan_versions(id,notebook_id,source_revision,source_hash,explanation,proposed_state) values ($1,'personal',1,'hash','Stale',$2::jsonb)",[stale,JSON.stringify(state)]);
  await assert.rejects(()=>db.query("select public.apply_coach_proposal($1)",[stale]),/COACH_CONFLICT/);
  const expired="00000000-0000-4000-8000-000000000003";
  await db.query("insert into public.coach_plan_versions(id,notebook_id,source_revision,source_hash,explanation,proposed_state,created_at) values ($1,'personal',2,'hash','Expired',$2::jsonb,now()-interval '1 day')",[expired,JSON.stringify(state)]);
  await assert.rejects(()=>db.query("select public.apply_coach_proposal($1)",[expired]),/COACH_EXPIRED/);
  const broken={...state,activities:[{...state.activities[0],distance:-1}]};await assert.rejects(()=>save(2,broken));
  assert.equal((await db.query<{revision:number}>("select revision from public.coach_notebooks")).rows[0].revision,2);
  await assert.rejects(()=>save(1),/COACH_CONFLICT/);
  const invalid="00000000-0000-4000-8000-000000000004";
  const invalidPlan={...state,sessions:[{...state.sessions[0],km:-1}]};
  await db.query("insert into public.coach_plan_versions(id,notebook_id,source_revision,source_hash,explanation,proposed_state) values ($1,'personal',2,'hash','Invalid',$2::jsonb)",[invalid,JSON.stringify(invalidPlan)]);
  await assert.rejects(()=>db.query("select public.apply_coach_proposal($1)",[invalid]));
  assert.equal((await db.query<{status:string}>("select status from public.coach_plan_versions where id=$1",[invalid])).rows[0].status,"pending");
  assert.equal((await db.query<{revision:number}>("select revision from public.coach_notebooks")).rows[0].revision,2);
  const concurrent=await Promise.allSettled([save(2),save(2)]);
  assert.equal(concurrent.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(concurrent.filter(result=>result.status==="rejected").length,1);
  for(const role of ["anon","authenticated"]){await db.exec(`set role ${role}`);await assert.rejects(()=>db.query("select * from public.training_sessions"),/permission denied/);await assert.rejects(()=>db.query("select public.apply_coach_proposal($1)",[id]),/permission denied/);await db.exec("reset role");}
  await db.exec("set role service_role");assert.equal((await db.query("select * from public.training_sessions")).rows.length,1);await db.exec("reset role");
 }finally{await db.close();}
});
