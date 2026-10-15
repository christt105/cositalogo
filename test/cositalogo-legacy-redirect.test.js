import { test } from "node:test";
import assert from "node:assert/strict";
import legacy, { NEW_ORIGIN } from "../tools/cositalogo-api/legacy-redirect/worker.js";

const OLD = "https://cositalogo-api.christt105.workers.dev";

test("API calls keep their method and path on the new origin", async () => {
  const res = await legacy.fetch(new Request(`${OLD}/api/titles/movie/550?x=1`, { method: "POST" }));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), `${NEW_ORIGIN}/api/titles/movie/550?x=1`);
});

test("pages move the browser to the new origin keeping the hash route", async () => {
  for (const path of ["/", "/index.html", "/whatever"]) {
    const res = await legacy.fetch(new Request(`${OLD}${path}`));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-robots-tag"), "noindex");
    const html = await res.text();
    assert.match(html, /location\.replace\("https:\/\/cositalogo\.christt105\.workers\.dev" \+ location\.pathname \+ location\.search \+ location\.hash\)/);
  }
});

test("a path that only starts like the API is still a page", async () => {
  const res = await legacy.fetch(new Request(`${OLD}/apis`));
  assert.equal(res.status, 200);
});
