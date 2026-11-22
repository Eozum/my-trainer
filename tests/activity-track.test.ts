import assert from "node:assert/strict";
import { test } from "node:test";
import { Encoder, Profile } from "@garmin/fitsdk";
import { zipSync } from "fflate";
import { garminTrack, trackFromFit } from "../lib/garmin-track";
import { providerActivityId, routePoints, type TrackPoint } from "../lib/route-points";

const first: TrackPoint = [48.875, 2.3125];
const last: TrackPoint = [48.875, 2.375];

function trackFit(points: TrackPoint[]) {
  const encoder = new Encoder();
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "development", product: 1 });
  for (const [lat, lon] of points) {
    encoder.onMesg(Profile.MesgNum.RECORD, {
      positionLat: Math.round(lat * 2 ** 31 / 180),
      positionLong: Math.round(lon * 2 ** 31 / 180),
    });
  }
  return encoder.close();
}

test("le format FIT natif et un export ZIP Garmin donnent le même tracé", () => {
  const fit = trackFit([first, last]);
  const zip = zipSync({ "course.fit": fit, "notes.txt": new Uint8Array(4) });
  for (const file of [fit, zip]) {
    const points = trackFromFit(file);
    assert.equal(points.length, 2);
    assert.ok(Math.abs(points[0][0] - first[0]) < 1e-6);
    assert.ok(Math.abs(points[1][1] - last[1]) < 1e-6);
  }
  assert.deepEqual(trackFromFit(trackFit([first])), []);
});

test("les données GPS invalides sont ignorées et une longue route conserve ses extrémités", () => {
  assert.deepEqual(routePoints([first, first, [91, 0], [null, 2], last]), [first, last]);
  const full = Array.from({ length: 4000 }, (_, i) => [48 + i / 10000, 2]);
  const sampled = routePoints(full);
  assert.ok(sampled.length <= 1800);
  assert.deepEqual(sampled[0], full[0]);
  assert.deepEqual(sampled.at(-1), full.at(-1));
  assert.equal(providerActivityId("00987654321"), "00987654321");
  assert.equal(providerActivityId("../other"), null);
  assert.equal(providerActivityId("9007199254740992"), null);
});

test("le tracé Garmin est demandé avec le jeton personnel sur le point de terminaison officiel", async t => {
  const zip = zipSync({ "run.fit": trackFit([first, last]) });
  const fetch = t.mock.method(globalThis, "fetch", async (input: string, options: RequestInit) => {
    if (options.method === "POST") return new Response("part.part.part");
    assert.equal(input, "https://personal.connectapi.garmin.com/download-service/files/activity/457");
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer part.part.part");
    return new Response(Uint8Array.from(zip).buffer);
  });
  assert.equal((await garminTrack("457", "test-key")).length, 2);
  assert.equal(fetch.mock.callCount(), 2);
});
