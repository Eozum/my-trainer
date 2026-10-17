import {test} from "node:test";import assert from "node:assert/strict";import {seal,unseal,encrypt} from "../lib/garmin";
process.env.TOKEN_ENCRYPTION_KEY="ab".repeat(32);
test("OAuth cookie binds the server user and rejects tampering",()=>{const raw=JSON.stringify({state:"random",userId:"user-a",verifier:"secret"}),signed=seal(raw);assert.deepEqual(unseal(signed),JSON.parse(raw));assert.throws(()=>unseal(Buffer.from(raw.replace("user-a","user-b")).toString("base64url")+"."+signed.split(".")[1]));});
test("vault encrypts without leaking token and uses random IV",()=>{const a=encrypt({access_token:"private-token"}),b=encrypt({access_token:"private-token"});assert.notEqual(a,b);assert.ok(!a.includes("private-token"));assert.equal(a.split(".").length,3);});
