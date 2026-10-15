import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bot, { RETIRED_TEXT, WEB_URL } from "../tools/telegram-bot/worker.js";

const WEBHOOK_SECRET = "hook-secret";
const env = { TELEGRAM_BOT_TOKEN: "bot-token", TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET };

function post(path, update, secret = WEBHOOK_SECRET) {
  return bot.fetch(
    new Request(`https://bot.test${path}`, {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": secret, "Content-Type": "application/json" },
      body: JSON.stringify(update),
    }),
    env,
  );
}

let calls;
let originalFetch;

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ method: new URL(String(url)).pathname.split("/").pop(), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("retired Telegram bot", () => {
  test("answers any private message with the web address", async () => {
    for (const text of ["/start", "la contraseña", "https://t.me/c/1/2/3", undefined]) {
      calls = [];
      const res = await post("/telegram-webhook", { message: { chat: { id: 7, type: "private" }, text } });
      assert.equal(res.status, 200);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, "sendMessage");
      assert.equal(calls[0].body.chat_id, 7);
      assert.equal(calls[0].body.text, RETIRED_TEXT);
    }
    assert.ok(RETIRED_TEXT.includes(WEB_URL));
  });

  test("answers a button left over from an old conversation", async () => {
    await post("/telegram-webhook", { callback_query: { id: "cq1", data: "q:1080p", message: { chat: { id: 7 } } } });
    assert.deepEqual(calls.map((c) => c.method), ["answerCallbackQuery", "sendMessage"]);
    assert.equal(calls[0].body.callback_query_id, "cq1");
    assert.equal(calls[1].body.text, RETIRED_TEXT);
  });

  test("stays quiet outside private chats", async () => {
    const res = await post("/telegram-webhook", { message: { chat: { id: -100, type: "supergroup" }, text: "hola" } });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 0);
  });

  test("rejects updates without the webhook secret", async () => {
    const res = await post("/telegram-webhook", { message: { chat: { id: 7, type: "private" }, text: "hola" } }, "wrong");
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
  });

  test("no longer serves the GitHub webhook", async () => {
    const res = await post("/github-webhook", {});
    assert.equal(res.status, 404);
  });
});
