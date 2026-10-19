import {test} from "node:test";
import assert from "node:assert/strict";
import {jsonBody,coachFailure,CoachError} from "../lib/coach-http";
import {validAccessKey,sameOrigin} from "../lib/coach-access";
test("coach request bounds count UTF-8 bytes, reject invalid JSON and hide internal errors",async()=>{
 assert.deepEqual(await jsonBody(new Request("https://example.test",{method:"POST",body:'{"a":1}'})),{a:1});
 await assert.rejects(()=>jsonBody(new Request("https://example.test",{method:"POST",body:'{"a":"ééé"}'}),10),error=>error instanceof CoachError&&error.status===413);
 await assert.rejects(()=>jsonBody(new Request("https://example.test",{method:"POST",body:'broken'})),error=>error instanceof CoachError&&error.status===400);
 const result=coachFailure(Error("private token value"));assert.equal(result.status,502);assert.ok(!(await result.text()).includes("private token value"));
});
test("private access validates strong configured key and exact browser origin",()=>{
 const oldKey=process.env.EOTRAINER_ACCESS_KEY,oldUrl=process.env.APP_URL;
 try{
  process.env.EOTRAINER_ACCESS_KEY="a".repeat(64);process.env.APP_URL="https://trainer.example";
  assert.equal(validAccessKey("a".repeat(64)),true);assert.equal(validAccessKey("incorrect"),false);
  assert.doesNotThrow(()=>sameOrigin(new Request("https://trainer.example",{headers:{Origin:"https://trainer.example"}})));
  assert.throws(()=>sameOrigin(new Request("https://trainer.example",{headers:{Origin:"https://other.example"}})));
  assert.throws(()=>sameOrigin(new Request("https://trainer.example")));
  process.env.EOTRAINER_ACCESS_KEY="weak";assert.throws(()=>validAccessKey("weak"));
 }finally{if(oldKey===undefined)delete process.env.EOTRAINER_ACCESS_KEY;else process.env.EOTRAINER_ACCESS_KEY=oldKey;if(oldUrl===undefined)delete process.env.APP_URL;else process.env.APP_URL=oldUrl;}
});
