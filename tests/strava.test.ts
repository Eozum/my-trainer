import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, type NextResponse } from "next/server";
import { normalizeActivity, tokenSchema } from "../lib/strava";
import { decrypt, encrypt } from "../lib/vault";
import { POST as connect } from "../app/api/strava/connect/route";
import { GET as callback } from "../app/api/strava/callback/route";
import { POST as sync } from "../app/api/strava/sync/route";
import { GET as status } from "../app/api/strava/status/route";
import { POST as disconnect } from "../app/api/strava/disconnect/route";
const row={id:42,sport_type:"TrailRun",start_date_local:"2026-10-17T23:30:00",distance:10500,moving_time:3600,total_elevation_gain:250};
test("Strava converts units, preserves local date and namespaces IDs",()=>{assert.deepEqual(normalizeActivity(row),{id:"strava:42",date:"2026-10-17",distance:10.5,minutes:60,elevation:250});});
test("non-running and empty activities are ignored",()=>{assert.equal(normalizeActivity({...row,sport_type:"Ride"}),null);assert.equal(normalizeActivity({...row,distance:0}),null);});
test("invalid activities and incomplete tokens are rejected",()=>{assert.throws(()=>normalizeActivity({...row,moving_time:-1}));assert.throws(()=>tokenSchema.parse({access_token:"a"}));});

test("activity import paginates and surfaces API failures",async()=>{
 const {activities}=await import("../lib/strava");const original=globalThis.fetch;const urls:string[]=[];
 try{globalThis.fetch=async(input,init)=>{urls.push(String(input));assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer private");return Response.json(urls.length===1?Array.from({length:100},(_,i)=>({...row,id:i+1})):[{...row,id:101}]);};const result=await activities("private");assert.equal(result.length,101);assert.match(urls[1],/page=2/);
 globalThis.fetch=async()=>new Response(null,{status:429});await assert.rejects(()=>activities("private"));
 }finally{globalThis.fetch=original;}
});
test("refresh exchange validates tokens and keeps credentials in request body",async()=>{
 const {exchange}=await import("../lib/strava");const original=globalThis.fetch;
 const credentials = {clientId: "123", clientSecret: "private"};
 try{globalThis.fetch=async(input,init)=>{assert.equal(String(input),"https://www.strava.com/oauth/token");assert.equal((init?.body as URLSearchParams).get("grant_type"),"refresh_token");assert.equal((init?.body as URLSearchParams).get("client_secret"),credentials.clientSecret);return Response.json({access_token:"new",refresh_token:"rotated",expires_at:2000000000});};assert.equal((await exchange({grant_type:"refresh_token",refresh_token:"old"}, credentials)).refresh_token,"rotated");
 globalThis.fetch=async()=>Response.json({access_token:"incomplete"});await assert.rejects(()=>exchange({grant_type:"refresh_token",refresh_token:"old"}, credentials));
 }finally{globalThis.fetch=original;}
});
test("Strava preserves the run name for history without breaking older imports",()=>{assert.equal(normalizeActivity({...row,name:"Les bords de Loire"})?.name,"Les bords de Loire");assert.equal(normalizeActivity(row)?.name,undefined);});

const origin = "https://trainer.example";
const oauthCookie = "strava_oauth";
const connectionCookie = "eotrainer_strava";
const manual = { clientId: "123", clientSecret: "manual-secret" };
const expiredTokens = { access_token: "expired", refresh_token: "old", expires_at: 1 };

async function withStravaEnvironment(run: () => Promise<void>) {
  const keys = ["APP_URL", "TOKEN_ENCRYPTION_KEY", "STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "VERCEL_PROJECT_PRODUCTION_URL"] as const;
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const key of keys) delete process.env[key];
    process.env.APP_URL = origin;
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function connectRequest(body?: unknown, requestOrigin = origin) {
  return new NextRequest(`${origin}/api/strava/connect`, {
    method: "POST",
    headers: { origin: requestOrigin, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function cookie(response: NextResponse, name: string) {
  const value = response.cookies.get(name)?.value;
  assert.ok(value);
  return `${name}=${value}`;
}

function callbackRequest(search: Record<string, string>, cookieHeader?: string) {
  return new NextRequest(`${origin}/api/strava/callback?${new URLSearchParams(search)}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

test("manual setup connects, refreshes with the same credentials and disconnects", async () => {
  await withStravaEnvironment(async () => {
    const start = await connect(connectRequest(manual));
    assert.equal(start.status, 200);
    const authorization = new URL((await start.json()).url);
    assert.equal(authorization.origin, "https://www.strava.com");
    assert.equal(authorization.searchParams.get("redirect_uri"), `${origin}/api/strava/callback`);
    assert.equal(authorization.searchParams.get("client_id"), manual.clientId);
    assert.ok(!authorization.href.includes(manual.clientSecret));
    assert.equal(start.cookies.get(oauthCookie)?.httpOnly, true);
    assert.equal(start.cookies.get(oauthCookie)?.sameSite, "lax");
    assert.equal(start.cookies.get(oauthCookie)?.maxAge, 600);
    assert.ok(!start.headers.get("set-cookie")?.includes(manual.clientSecret));

    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://www.strava.com/oauth/token");
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("client_id"), manual.clientId);
      assert.equal(body.get("client_secret"), manual.clientSecret);
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("code"), "provider-code");
      return Response.json(expiredTokens);
    };
    const result = await callback(callbackRequest({
      state: authorization.searchParams.get("state")!,
      code: "provider-code",
      scope: "read,activity:read_all",
    }, cookie(start, oauthCookie)));
    assert.equal(result.headers.get("location"), `${origin}/?strava=connected#strava`);
    assert.equal(result.cookies.get(oauthCookie)?.maxAge, 0);
    assert.deepEqual(decrypt(result.cookies.get(connectionCookie)!.value), { ...expiredTokens, credentials: manual });

    const connectedCookie = cookie(result, connectionCookie);
    const connected = await status(new NextRequest(`${origin}/api/strava/status`, { headers: { cookie: connectedCookie } })).json();
    assert.deepEqual(connected, { connected: true, defaultConfigured: false, callbackDomain: "trainer.example" });

    globalThis.fetch = async (input, init) => {
      if (String(input) === "https://www.strava.com/oauth/token") {
        const body = init?.body as URLSearchParams;
        assert.equal(body.get("client_id"), manual.clientId);
        assert.equal(body.get("client_secret"), manual.clientSecret);
        assert.equal(body.get("grant_type"), "refresh_token");
        assert.equal(body.get("refresh_token"), "old");
        return Response.json({ access_token: "new", refresh_token: "rotated", expires_at: 2000000000 });
      }
      assert.match(String(input), /\/api\/v3\/athlete\/activities/);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer new");
      return Response.json([row]);
    };
    const syncRequest = () => new NextRequest(`${origin}/api/strava/sync`, {
      method: "POST", headers: { origin, cookie: connectedCookie },
    });
    const imported = await sync(syncRequest());
    assert.deepEqual(await imported.json(), { activities: [normalizeActivity(row)] });
    assert.equal(decrypt(imported.cookies.get(connectionCookie)!.value).refresh_token, "rotated");

    const removed = disconnect(new Request(`${origin}/api/strava/disconnect`, { method: "POST", headers: { origin } }));
    assert.equal(removed.cookies.get(connectionCookie)?.maxAge, 0);
    assert.equal(removed.cookies.get(connectionCookie)?.path, "/api/strava");
  });
});

test("connect reports invalid setup and callback handles expired, refused and insufficient authorization", async () => {
  await withStravaEnvironment(async () => {
    assert.equal((await connect(connectRequest(manual, "https://other.example"))).status, 403);
    assert.equal((await connect(connectRequest({ ...manual, clientId: "wrong" }))).status, 400);
    assert.equal((await (await connect(connectRequest())).json()).setupRequired, true);
    const start = await connect(connectRequest(manual));
    const authorization = new URL((await start.json()).url);
    const state = authorization.searchParams.get("state")!;
    const flow = cookie(start, oauthCookie);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(null, { status: 400 });
    };

    const mismatch = await callback(callbackRequest({ state: "old-state", code: "old-code" }, flow));
    assert.equal(new URL(mismatch.headers.get("location")!).searchParams.get("strava"), "expired");
    assert.equal(mismatch.cookies.has(oauthCookie), false);
    const expired = `${oauthCookie}=${encrypt({ state, expires: Date.now() - 1, credentials: manual })}`;
    const expiredCallback = await callback(callbackRequest({ state, code: "old-code" }, expired));
    assert.equal(new URL(expiredCallback.headers.get("location")!).searchParams.get("strava"), "expired");
    const refused = await callback(callbackRequest({ state, error: "access_denied" }, flow));
    assert.equal(new URL(refused.headers.get("location")!).searchParams.get("strava"), "denied");
    assert.equal(refused.cookies.get(oauthCookie)?.maxAge, 0);
    const missingPermission = await callback(callbackRequest({ state, code: "code", scope: "read" }, flow));
    assert.equal(new URL(missingPermission.headers.get("location")!).searchParams.get("strava"), "scope");
    assert.equal(calls, 0);

    const providerError = await callback(callbackRequest({ state, code: "code", scope: "read activity:read_all" }, flow));
    assert.equal(new URL(providerError.headers.get("location")!).searchParams.get("strava"), "error");
    assert.ok(!providerError.cookies.has(connectionCookie));
    assert.equal(calls, 1);

    delete process.env.TOKEN_ENCRYPTION_KEY;
    assert.equal((await connect(connectRequest(manual))).status, 503);
  });
});

test("server configuration still connects and existing cookies refresh after an import failure", async () => {
  await withStravaEnvironment(async () => {
    process.env.STRAVA_CLIENT_ID = "456";
    process.env.STRAVA_CLIENT_SECRET = "server-secret";
    const start = await connect(connectRequest());
    assert.equal(start.status, 200);
    const authorization = new URL((await start.json()).url);
    assert.equal(authorization.searchParams.get("client_id"), "456");
    const previous = `${connectionCookie}=${encrypt(expiredTokens)}`;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/oauth/token")) {
        assert.equal((init?.body as URLSearchParams).get("client_secret"), "server-secret");
        return Response.json({ access_token: "new", refresh_token: "rotated", expires_at: 2000000000 });
      }
      return new Response(null, { status: 429 });
    };
    const result = await sync(new NextRequest(`${origin}/api/strava/sync`, {
      method: "POST", headers: { origin, cookie: previous },
    }));
    assert.equal(result.status, 502);
    assert.deepEqual(decrypt(result.cookies.get(connectionCookie)!.value), {
      access_token: "new", refresh_token: "rotated", expires_at: 2000000000,
    });
  });
});
