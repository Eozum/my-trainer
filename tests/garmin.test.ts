import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { DELETE as disconnect, GET as status, POST as connect } from "../app/api/garmin/route";
import { POST as sync } from "../app/api/garmin/sync/route";
import { garminActivities, normalizeGarminActivity } from "../lib/garmin";
import { importActivities } from "../lib/local-state";
import { addDays, day, defaultRace } from "../lib/model";

const origin = "https://trainer.example";
const api = "https://personal.connectapi.garmin.com";
const key = "test-garmin-key";
const jwt = "test.payload.signature";
const today = day();
const row = {
  activityId: 457,
  activityName: "Sentiers",
  activityType: { typeKey: "trail_running" },
  startTimeLocal: `${today} 23:34:56`,
  duration: 3800,
  movingDuration: 3600,
  distance: 10500,
  elevationGain: 360,
};

test("normalise les unités Garmin et conserve la date locale", () => {
  assert.deepEqual(normalizeGarminActivity(row), {
    id: "garmin:457", name: "Sentiers", date: today, distance: 10.5, minutes: 60, elevation: 360,
  });
  assert.equal(normalizeGarminActivity({ ...row, activityType: { typeKey: "cycling" } }), null);
  assert.equal(normalizeGarminActivity({ ...row, distance: 0 }), null);
  const treadmill = normalizeGarminActivity({
    ...row, activityType: { typeKey: "treadmill_running" }, movingDuration: null, elevationGain: null, activityName: "",
  });
  assert.equal(treadmill?.minutes, row.duration / 60);
  assert.equal(treadmill?.elevation, 0);
  assert.equal(treadmill?.name, undefined);
});

test("pagine la recherche Garmin et filtre les dates et les identifiants répétés", async t => {
  const urls: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input: URL | string, options: RequestInit) => {
    const url = new URL(input);
    assert.equal(url.origin, api);
    assert.equal(options.redirect, "error");
    const headers = new Headers(options.headers);
    if (options.method === "POST") {
      assert.equal(url.pathname, "/personalapitoken-service/personal-api/personal-api-key/token");
      assert.equal(headers.get("Authorization"), `ApiKey ${key}`);
      return new Response(jwt);
    }

    assert.equal(url.pathname, "/activitylist-service/activities/search/activities");
    assert.equal(headers.get("Authorization"), `Bearer ${jwt}`);
    assert.equal(headers.get("Accept"), "*/*");
    urls.push(url);
    assert.equal(url.searchParams.get("activityType"), "running");
    assert.equal(url.searchParams.get("startDate"), addDays(today, -89));
    assert.equal(url.searchParams.get("endDate"), today);
    assert.equal(url.searchParams.get("limit"), "100");
    if (urls.length === 1) return Response.json(Array.from({ length: 100 }, (_, i) => ({ ...row, activityId: i + 1 })));
    return Response.json([
      { ...row, activityId: 100 },
      { ...row, startTimeLocal: `${addDays(today, -90)} 12:00:00` },
      { ...row, startTimeLocal: `${addDays(today, 1)} 12:00:00` },
      { ...row, activityId: 101 },
    ]);
  });

  assert.equal((await garminActivities(key, today)).length, 101);
  assert.deepEqual(urls.map(url => url.searchParams.get("start")), ["0", "100"]);
});

test("valide et chiffre la clé avant de permettre l’import et la déconnexion", async t => {
  const oldOrigin = process.env.APP_URL;
  const oldKey = process.env.TOKEN_ENCRYPTION_KEY;
  process.env.APP_URL = origin;
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  t.after(() => {
    if (oldOrigin === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = oldOrigin;
    if (oldKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = oldKey;
  });

  let providerStatus = 200;
  const mocked = t.mock.method(globalThis, "fetch", async (_input: URL | string, options: RequestInit) => {
    if (providerStatus !== 200) return new Response("Données internes Garmin", { status: providerStatus });
    return options.method === "POST" ? new Response(jwt) : Response.json([row]);
  });
  const setup = (requestOrigin = origin, value = key) => new NextRequest(`${origin}/api/garmin`, {
    method: "POST", headers: { origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify({ key: value }),
  });

  assert.equal((await connect(setup("https://autre.example"))).status, 403);
  assert.equal((await connect(setup(origin, "clé invalide"))).status, 400);
  assert.equal(mocked.mock.callCount(), 0);

  const connection = await connect(setup());
  assert.equal(connection.status, 200);
  assert.deepEqual(await connection.json(), { connected: true });
  assert.ok(!connection.headers.get("set-cookie")?.includes(key));
  const stored = connection.cookies.get("eotrainer_garmin")!;
  assert.equal(stored.httpOnly, true);
  assert.equal(stored.sameSite, "strict");
  assert.equal(stored.path, "/api/garmin");
  const cookie = `${stored.name}=${stored.value}`;
  assert.deepEqual(await status(new NextRequest(`${origin}/api/garmin`, { headers: { cookie } })).json(), {
    connected: true, error: null,
  });

  const syncRequest = (withCookie = true) => new NextRequest(`${origin}/api/garmin/sync`, {
    method: "POST", headers: withCookie ? { origin, cookie } : { origin },
  });
  assert.equal((await sync(syncRequest(false))).status, 409);
  const imported = await sync(syncRequest());
  assert.equal(imported.status, 200);
  const { activities } = await imported.json();
  assert.deepEqual(activities, [normalizeGarminActivity(row)]);
  const state = importActivities({ race: defaultRace, activities: [], sessions: [] }, activities);
  assert.equal(importActivities(state, activities).activities.length, 1);

  providerStatus = 401;
  const revoked = await sync(syncRequest());
  assert.equal(revoked.status, 401);
  assert.match((await revoked.json()).error, /expiré/);
  assert.equal((await connect(setup())).cookies.has(stored.name), false);

  providerStatus = 429;
  assert.equal((await sync(syncRequest())).status, 429);

  assert.equal(disconnect(new Request(`${origin}/api/garmin`, { method: "DELETE" })).status, 403);
  const clear = disconnect(new Request(`${origin}/api/garmin`, { method: "DELETE", headers: { origin } }));
  assert.equal(clear.cookies.get(stored.name)?.maxAge, 0);
  assert.equal(clear.cookies.get(stored.name)?.path, "/api/garmin");

  delete process.env.TOKEN_ENCRYPTION_KEY;
  assert.equal((await connect(setup())).status, 503);
});
