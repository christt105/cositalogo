import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { linkKey } from "../site/rules.js";
import { link, GROUP_ID, OTHER_GROUP_ID } from "./fixtures.js";

describe("linkKey", () => {
  test("ignores the topic segment", () => {
    assert.equal(linkKey(link(42, 7)), `https://t.me/c/${GROUP_ID}/42`);
    assert.equal(linkKey(link(42)), `https://t.me/c/${GROUP_ID}/42`);
    assert.equal(linkKey(link(42, 7)), linkKey(link(42, 16088)));
  });

  test("keeps group and message id apart", () => {
    assert.notEqual(linkKey(link(42)), linkKey(link(43)));
    assert.notEqual(linkKey(link(42)), linkKey(`https://t.me/c/${OTHER_GROUP_ID}/42`));
  });

  test("returns any other string unchanged", () => {
    assert.equal(linkKey("https://t.me/publico/1"), "https://t.me/publico/1");
    assert.equal(linkKey(`https://t.me/c/${GROUP_ID}/42/`), `https://t.me/c/${GROUP_ID}/42/`);
  });
});
