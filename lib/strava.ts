import {z} from "zod";
import {activitySchema,type Activity} from "./model";
export const tokenSchema=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_at:z.number().int().positive()});
export type Tokens=z.infer<typeof tokenSchema>;
export async function exchange(fields:Record<string,string>):Promise<Tokens>{
 const response=await fetch("https://www.strava.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.STRAVA_CLIENT_ID!,client_secret:process.env.STRAVA_CLIENT_SECRET!,...fields}),signal:AbortSignal.timeout(15000),cache:"no-store"});
 if(!response.ok)throw Error("Strava token exchange failed");return tokenSchema.parse(await response.json());
}
const summary=z.object({name:z.string().trim().min(1).max(200).optional(),id:z.number().int().positive(),sport_type:z.string(),start_date_local:z.string().regex(/^\d{4}-\d{2}-\d{2}T/),distance:z.number().nonnegative(),moving_time:z.number().nonnegative(),total_elevation_gain:z.number().nonnegative()});
export function normalizeActivity(value:unknown):Activity|null{const a=summary.parse(value);if(!["Run","TrailRun","VirtualRun"].includes(a.sport_type)||!a.distance||!a.moving_time)return null;return activitySchema.parse({...(a.name ? {name:a.name} : {}),id:`strava:${a.id}`,date:a.start_date_local.slice(0,10),distance:a.distance/1000,minutes:a.moving_time/60,elevation:a.total_elevation_gain});}
export async function activities(token:string){const result:Activity[]=[];const after=Math.floor(Date.now()/1000)-90*86400;
 // Bound requests and surface truncation rather than silently losing history.
 for(let page=1;page<=10;page++){const r=await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error("Strava activities unavailable");const rows=z.array(z.unknown()).max(100).parse(await r.json());for(const row of rows){const a=normalizeActivity(row);if(a)result.push(a);}if(rows.length<100)return result;}
 throw Error("Too many Strava activities");
}
