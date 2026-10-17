import {authenticated,failure,body} from "@/lib/server";
import {stateSchema} from "@/lib/model";
export async function GET(req:Request){try{const {db,user}=await authenticated(req);const {data,error}=await db.from("runner_state").select("data").eq("user_id",user.id).maybeSingle();if(error)throw error;return Response.json(data?.data??null,{headers:{"Cache-Control":"no-store"}});}catch(e){return failure(e);}}
export async function PUT(req:Request){try{const {db,user}=await authenticated(req);const data=stateSchema.parse(await body(req));const {error}=await db.from("runner_state").upsert({user_id:user.id,data,updated_at:new Date().toISOString()});if(error)throw error;return Response.json({ok:true});}catch(e){return failure(e);}}
