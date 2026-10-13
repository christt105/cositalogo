import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import worker from "../tools/cositalogo-api/src/worker.js";
import { MAX_PASSWORD_FAILURES, PASSWORD_WINDOW_MS } from "../tools/cositalogo-api/src/access.js";
import { MAX_PENDING_LOGINS } from "../tools/cositalogo-api/src/login.js";
import { signSession } from "../tools/cositalogo-api/src/session.js";
import { createD1 } from "./d1-shim.js";

const MIGRATIONS = fileURLToPath(new URL("../tools/cositalogo-api/migrations", import.meta.url));
const SECRET = "test-session-secret";
const HOOK_SECRET = "test-webhook-secret";
const PASSWORD = "palomitas";
const ADMIN = 100;

let env;
let originalFetch;

beforeEach(() => {
  env = {
    DB: createD1(MIGRATIONS),
    SESSION_SECRET: SECRET,
    TELEGRAM_WEBHOOK_SECRET: HOOK_SECRET,
    WRITE_PASSWORD: PASSWORD,
    BOT_USERNAME: "cositalogo_bot",
  };
  env.DB.sqlite.prepare("INSERT INTO admins (user_id, name, created_at) VALUES (?, 'Christian', 0)").run(ADMIN);
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    throw new Error(`unexpected fetch ${input}`);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sessionCookie = async (uid, name = `user ${uid}`) =>
  `s=${await signSession({ uid, name, exp: Date.now() + 3600e3 }, SECRET)}`;

async function call(method, path, { body, uid, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] ??= "application/json";
  if (uid !== undefined) h.cookie = await sessionCookie(uid);
  if (cookie !== undefined) h.cookie = cookie;
  const req = new Request(`https://cositalogo.test${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return worker.fetch(req, env);
}

/** The `name=value` pairs of every Set-Cookie header, plus their raw attributes. */
function cookiesOf(res) {
  return Object.fromEntries(res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const at = pair.indexOf("=");
    return [pair.slice(0, at), { value: pair.slice(at + 1), raw: c }];
  }));
}

async function startLogin() {
  const res = await call("POST", "/api/login");
  assert.equal(res.status, 201);
  const { url } = await res.json();
  const nonce = new URL(url).searchParams.get("start").replace(/^login_/, "");
  return { url, nonce, cookie: `l=${cookiesOf(res).l.value}` };
}

const privateStart = (text, from = { id: 555, first_name: "Ana", last_name: "García" }) => ({
  update_id: 1,
  message: { message_id: 1, from: { is_bot: false, ...from }, chat: { id: from.id, type: "private" }, text },
});

const hook = (update, secret = HOOK_SECRET) =>
  call("POST", "/api/telegram", { body: update, headers: secret === null ? {} : { "x-telegram-bot-api-secret-token": secret } });

const auditRows = () => env.DB.sqlite.prepare("SELECT * FROM audit ORDER BY id").all();

describe("sign-in through the bot", () => {
  test("hands out a deep link to the bot and a browser cookie scoped to the login endpoints", async () => {
    const res = await call("POST", "/api/login");
    assert.equal(res.status, 201);
    const { url, expiresAt } = await res.json();
    assert.match(url, /^https:\/\/t\.me\/cositalogo_bot\?start=login_[A-Za-z0-9_-]{22}$/);
    assert.ok(expiresAt > Date.now());
    const { raw } = cookiesOf(res).l;
    for (const attr of ["Path=/api/login", "HttpOnly", "Secure", "SameSite=Lax", "Max-Age=300"]) assert.ok(raw.includes(attr), raw);
  });

  test("goes from pending to a session once the user presses Start", async () => {
    const { nonce, cookie } = await startLogin();
    assert.equal((await call("POST", "/api/login/poll", { cookie })).status, 202);

    const answer = await hook(privateStart(`/start login_${nonce}`));
    assert.equal(answer.status, 200);
    assert.deepEqual(await answer.json(), {
      method: "sendMessage", chat_id: 555, text: "Listo, ya puedes volver a la web del Cositálogo.",
    });

    const res = await call("POST", "/api/login/poll", { cookie });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: 555, name: "Ana García", member: false, admin: false });
    const cookies = cookiesOf(res);
    assert.ok(cookies.s.raw.includes("HttpOnly") && cookies.s.raw.includes("Path=/;"), cookies.s.raw);
    assert.ok(cookies.l.raw.includes("Max-Age=0"));

    const me = await call("GET", "/api/me", { cookie: `s=${cookies.s.value}` });
    assert.deepEqual(await me.json(), { id: 555, name: "Ana García", member: false, admin: false });
  });

  test("hands out the session only once", async () => {
    const { nonce, cookie } = await startLogin();
    await hook(privateStart(`/start login_${nonce}`));
    assert.equal((await call("POST", "/api/login/poll", { cookie })).status, 200);
    assert.equal((await call("POST", "/api/login/poll", { cookie })).status, 410);
  });

  test("does not let a nonce be confirmed twice or by someone else", async () => {
    const { nonce, cookie } = await startLogin();
    await hook(privateStart(`/start login_${nonce}`));
    const again = await hook(privateStart(`/start login_${nonce}`, { id: 666, first_name: "Mallory" }));
    assert.match((await again.json()).text, /ya se usó o ha caducado/);
    assert.equal((await (await call("POST", "/api/login/poll", { cookie })).json()).id, 555);
  });

  test("does not give the session to a browser that only saw the link", async () => {
    const { nonce, cookie } = await startLogin();
    await hook(privateStart(`/start login_${nonce}`));
    for (const other of [`l=${nonce}`, `l=${nonce}.wrong`, `l=${nonce}.${"A".repeat(43)}`, ""]) {
      const res = await call("POST", "/api/login/poll", { cookie: other });
      assert.equal(res.status, 410, other);
      assert.equal(res.headers.getSetCookie().some((c) => c.startsWith("s=")), false);
    }
    assert.equal((await call("POST", "/api/login/poll", { cookie })).status, 200);
  });

  test("lets a sign-in expire", async () => {
    const { nonce, cookie } = await startLogin();
    env.DB.sqlite.exec("UPDATE login_requests SET expires_at = 1");
    const answer = await hook(privateStart(`/start login_${nonce}`));
    assert.match((await answer.json()).text, /caducado/);
    assert.equal((await call("POST", "/api/login/poll", { cookie })).status, 410);
  });

  test("purges expired sign-ins and caps the pending ones", async () => {
    const insert = env.DB.sqlite.prepare("INSERT INTO login_requests (nonce, browser_hash, expires_at) VALUES (?, 'x', ?)");
    for (let i = 0; i < 10; i++) insert.run(`old${i}`, 1);
    for (let i = 0; i < MAX_PENDING_LOGINS; i++) insert.run(`live${i}`, Date.now() + 60e3);
    assert.equal((await call("POST", "/api/login")).status, 429);
    assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM login_requests WHERE expires_at = 1").get().n, 0);
  });

  test("answers 503 while the bot is not configured", async () => {
    delete env.BOT_USERNAME;
    assert.equal((await call("POST", "/api/login")).status, 503);
  });

  test("clears the session cookie on logout", async () => {
    const res = await call("POST", "/api/logout", { uid: 555 });
    assert.equal(res.status, 204);
    assert.ok(cookiesOf(res).s.raw.includes("Max-Age=0"));
  });
});

describe("Telegram webhook", () => {
  test("refuses requests without the right secret token, and fails closed when it is not configured", async () => {
    const { nonce } = await startLogin();
    assert.equal((await hook(privateStart(`/start login_${nonce}`), null)).status, 401);
    assert.equal((await hook(privateStart(`/start login_${nonce}`), "nope")).status, 401);
    delete env.TELEGRAM_WEBHOOK_SECRET;
    assert.equal((await hook(privateStart(`/start login_${nonce}`), "")).status, 401);
    assert.equal(env.DB.sqlite.prepare("SELECT user_id FROM login_requests").get().user_id, null);
  });

  test("stays silent outside private chats, so it never talks in a group", async () => {
    const { nonce } = await startLogin();
    const update = privateStart(`/start login_${nonce}`);
    update.message.chat = { id: -100123, type: "supergroup" };
    const res = await hook(update);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "");
    assert.equal(env.DB.sqlite.prepare("SELECT user_id FROM login_requests").get().user_id, null);
  });

  test("ignores other bots and updates that are not messages", async () => {
    const { nonce } = await startLogin();
    const fromBot = privateStart(`/start login_${nonce}`);
    fromBot.message.from.is_bot = true;
    for (const update of [fromBot, { update_id: 2, edited_message: privateStart("hola").message }, "not json"]) {
      const res = await hook(update);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "");
    }
  });

  test("points anything else in a private chat back to the web", async () => {
    for (const text of ["/start", "hola", "/start login_short", undefined]) {
      const res = await hook(privateStart(text));
      assert.match((await res.json()).text, /usa el botón de la web/, String(text));
    }
  });

  test("falls back to the username or the id when the user has no name", async () => {
    const { nonce, cookie } = await startLogin();
    await hook(privateStart(`/start login_${nonce}`, { id: 777, username: "anita" }));
    assert.equal((await (await call("POST", "/api/login/poll", { cookie })).json()).name, "anita");
  });
});

describe("write password", () => {
  test("is needed before writing, even with a valid session", async () => {
    const res = await call("POST", "/api/links", { uid: 555, body: {} });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /write password/);
  });

  test("turns the user into a member and records it", async () => {
    const res = await call("POST", "/api/unlock", { uid: 555, body: { password: PASSWORD } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: 555, name: "user 555", member: true, admin: false });
    assert.equal((await (await call("GET", "/api/me", { uid: 555 })).json()).member, true);
    const [row] = auditRows();
    assert.equal(row.user_id, 555);
    assert.equal(row.action, "grant");
    assert.equal(row.target, "member:555");
    assert.deepEqual(JSON.parse(row.after), { name: "user 555", via: "password" });
  });

  test("needs a session", async () => {
    assert.equal((await call("POST", "/api/unlock", { body: { password: PASSWORD } })).status, 401);
  });

  test("rejects a wrong password and stops guessing after a few tries", async () => {
    for (const password of ["Palomitas", "", undefined, 123]) {
      assert.equal((await call("POST", "/api/unlock", { uid: 555, body: { password } })).status, 403);
    }
    assert.equal((await call("POST", "/api/unlock", { uid: 555, body: { password: "x" } })).status, 403);
    assert.equal((await call("POST", "/api/unlock", { uid: 555, body: { password: PASSWORD } })).status, 429);
    assert.equal((await call("POST", "/api/unlock", { uid: 556, body: { password: PASSWORD } })).status, 200);
    assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM password_failures WHERE user_id = 555").get().n, MAX_PASSWORD_FAILURES);
  });

  test("forgets old failures", async () => {
    const insert = env.DB.sqlite.prepare("INSERT INTO password_failures (user_id, at) VALUES (555, ?)");
    for (let i = 0; i < MAX_PASSWORD_FAILURES; i++) insert.run(Date.now() - PASSWORD_WINDOW_MS - 1);
    assert.equal((await call("POST", "/api/unlock", { uid: 555, body: { password: PASSWORD } })).status, 200);
    assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM password_failures").get().n, 0);
  });

  test("answers 503 and grants nothing while the password is not configured", async () => {
    delete env.WRITE_PASSWORD;
    assert.equal((await call("POST", "/api/unlock", { uid: 555, body: { password: "" } })).status, 503);
    assert.equal((await (await call("GET", "/api/me", { uid: 555 })).json()).member, false);
  });

  test("is not asked again from members or admins", async () => {
    const res = await call("POST", "/api/unlock", { uid: ADMIN, body: {} });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: ADMIN, name: `user ${ADMIN}`, member: true, admin: true });
    assert.equal(auditRows().length, 0);
  });
});

describe("member and admin management", () => {
  const unlock = (uid) => call("POST", "/api/unlock", { uid, body: { password: PASSWORD } });

  test("is for admins only", async () => {
    await unlock(555);
    for (const [method, path] of [["GET", "/api/members"], ["DELETE", "/api/members/555"], ["GET", "/api/admins"], ["PUT", "/api/admins/555"], ["DELETE", `/api/admins/${ADMIN}`]]) {
      assert.equal((await call(method, path, { uid: 555 })).status, 403, `${method} ${path}`);
      assert.equal((await call(method, path)).status, 401, `${method} ${path}`);
    }
  });

  test("lists and revokes members, with immediate effect on their session", async () => {
    await unlock(555);
    await unlock(556);
    const members = await (await call("GET", "/api/members", { uid: ADMIN })).json();
    assert.deepEqual(members.map((m) => [m.id, m.name]), [[555, "user 555"], [556, "user 556"]]);

    assert.equal((await call("DELETE", "/api/members/555", { uid: ADMIN })).status, 204);
    assert.equal((await call("POST", "/api/links", { uid: 555, body: {} })).status, 403);
    assert.equal((await call("DELETE", "/api/members/555", { uid: ADMIN })).status, 404);
    const revoke = auditRows().at(-1);
    assert.deepEqual([revoke.user_id, revoke.action, revoke.target], [ADMIN, "revoke", "member:555"]);
  });

  test("promotes members to admin once, and lets admins remove other admins but not themselves", async () => {
    assert.equal((await call("PUT", "/api/admins/555", { uid: ADMIN })).status, 404);
    await unlock(555);
    assert.equal((await call("PUT", "/api/admins/555", { uid: ADMIN })).status, 204);
    assert.equal((await call("PUT", "/api/admins/555", { uid: ADMIN })).status, 204);
    assert.equal(auditRows().filter((r) => r.target === "admin:555").length, 1);
    const admins = await (await call("GET", "/api/admins", { uid: ADMIN })).json();
    assert.deepEqual(admins.map((a) => [a.id, a.name]), [[ADMIN, "Christian"], [555, "user 555"]]);
    assert.equal((await (await call("GET", "/api/me", { uid: 555 })).json()).admin, true);

    assert.equal((await call("DELETE", "/api/admins/555", { uid: 555 })).status, 400);
    assert.equal((await call("DELETE", `/api/admins/${ADMIN}`, { uid: 555 })).status, 204);
    assert.equal((await call("GET", "/api/members", { uid: ADMIN })).status, 403);
    assert.equal((await call("DELETE", `/api/admins/${ADMIN}`, { uid: 555 })).status, 404);
  });

  test("rejects ids that cannot be Telegram users", async () => {
    assert.equal((await call("PUT", "/api/admins/0", { uid: ADMIN })).status, 400);
    assert.equal((await call("PUT", "/api/admins/9999999999999999", { uid: ADMIN })).status, 404);
  });
});
