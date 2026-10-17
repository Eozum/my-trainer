import {createClient} from "@supabase/supabase-js";
export async function authenticated(req:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error("Configuration Supabase manquante");
 const token=req.headers.get("authorization")?.replace(/^Bearer /,"");
 if(!token)throw new Error("UNAUTHORIZED");
 const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data,error}=await db.auth.getUser(token);if(error||!data.user)throw new Error("UNAUTHORIZED");return {db,user:data.user};
}
export function failure(e:unknown){const message=e instanceof Error?e.message:"Erreur";return Response.json({error:message==="UNAUTHORIZED"?"Connexion requise":"Requête impossible. Vérifiez la configuration ou les données."},{status:message==="UNAUTHORIZED"?401:400});}
export async function body(req:Request){const text=await req.text();if(text.length>500000)throw new Error("Payload trop grand");return JSON.parse(text);}
