import { test } from "node:test";
import assert from "node:assert/strict";
import { NEW_SITE, redirectTarget } from "../site/redirect.js";

test("title pages keep their route", () => {
  assert.equal(redirectTarget("#/movie/550"), `${NEW_SITE}#/movie/550`);
  assert.equal(redirectTarget("#/series/1399"), `${NEW_SITE}#/series/1399`);
});

test("the search survives, other grid filters are dropped", () => {
  assert.equal(redirectTarget("#/?q=se%C3%B1or&type=movie&genre=Drama"), `${NEW_SITE}#/?q=se%C3%B1or`);
  assert.equal(redirectTarget("#/?type=series"), NEW_SITE);
});

test("add goes to the new add view whatever it carried", () => {
  assert.equal(redirectTarget("#/add?tmdb=550"), `${NEW_SITE}#/add`);
});

test("anything else opens the grid", () => {
  for (const hash of ["", "#", "#/", "#/batch", "#/movie/abc", "#/whatever"]) {
    assert.equal(redirectTarget(hash), NEW_SITE, hash);
  }
});
