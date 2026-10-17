import {authenticated,failure} from "@/lib/server";import {vault} from "@/lib/vault";
export async function POST(req:Request){try{const {user}=await authenticated(req);const {error}=await vault().from("strava_connections").delete().eq("user_id",user.id);if(error)throw error;return Response.json({ok:true});}catch(e){return failure(e);}}
