import {authenticated,failure,body} from "@/lib/server";import {stateSchema} from "@/lib/model";import {generate} from "@/lib/planner";
export async function POST(req:Request){try{await authenticated(req);return Response.json(generate(stateSchema.parse(await body(req))));}catch(e){return failure(e);}}
