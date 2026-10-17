import {createCipheriv,randomBytes,createHmac,timingSafeEqual} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
export function vault(){if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error("Missing service role");return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});}
export function encrypt(value:unknown){const key=Buffer.from(process.env.TOKEN_ENCRYPTION_KEY??"","hex");if(key.length!==32)throw Error("Missing encryption key");const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString("base64url")).join(".");}

export function seal(value:string){return Buffer.from(value).toString("base64url")+"."+createHmac("sha256",process.env.TOKEN_ENCRYPTION_KEY!).update(value).digest("base64url");}
export function unseal(value:string){const [encoded,signature]=value.split(".");const raw=Buffer.from(encoded,"base64url").toString("utf8");const expected=createHmac("sha256",process.env.TOKEN_ENCRYPTION_KEY!).update(raw).digest();const received=Buffer.from(signature??"","base64url");if(received.length!==expected.length||!timingSafeEqual(received,expected))throw Error("Invalid OAuth cookie");return JSON.parse(raw);}
