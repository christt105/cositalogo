import { serveAsset } from "./assets.js";
import { addAdmin, listAdmins, listMembers, removeAdmin, revokeMember, unlock } from "./access.js";
import { listAudit } from "./audit.js";
import { serveCatalog, serveTitle } from "./catalog.js";
import { serveFeed } from "./feed.js";
import { HttpError, json, readJson } from "./http.js";
import { addLink, deleteLink, listTitleLinks, moveLink, parseTarget, setPoster, updateLink } from "./links.js";
import { logout, pollLogin, startLogin, telegramWebhook } from "./login.js";
import { requireAdmin, requireUser, requireWriter } from "./session.js";
import { loadSettings } from "./settings.js";
import { undo } from "./undo.js";

const ROUTES = [
  ["GET", /^\/api\/catalog$/, (req, env) => serveCatalog(req, env.DB)],
  ["GET", /^\/feed\.xml$/, (req, env) => serveFeed(req, env.DB)],
  ["GET", /^\/api\/titles\/(movie|series)\/(\d{1,9})$/, (req, env, [type, id]) => serveTitle(env.DB, type, Number(id))],
  ["GET", /^\/api\/titles\/(movie|series)\/(\d{1,9})\/links$/, async (req, env, [type, id]) => json(await listTitleLinks(env.DB, await requireUser(req, env), type, Number(id)))],
  ["GET", /^\/api\/settings$/, async (req, env) => {
    const { qualities, groups, languages } = await loadSettings(env.DB);
    return json({ qualities, groups, languages });
  }],
  ["POST", /^\/api\/login$/, (req, env) => startLogin(env)],
  ["POST", /^\/api\/login\/poll$/, (req, env) => pollLogin(req, env)],
  ["POST", /^\/api\/logout$/, () => logout()],
  ["POST", /^\/api\/telegram$/, (req, env) => telegramWebhook(req, env)],
  ["GET", /^\/api\/me$/, async (req, env) => json(await requireUser(req, env))],
  ["POST", /^\/api\/unlock$/, async (req, env) => unlock(env, await requireUser(req, env), await readJson(req))],
  ["GET", /^\/api\/members$/, admin((req, env) => listMembers(env.DB))],
  ["DELETE", /^\/api\/members\/(\d{1,15})$/, admin((req, env, user, [id]) => revokeMember(env.DB, user, id))],
  ["GET", /^\/api\/admins$/, admin((req, env) => listAdmins(env.DB))],
  ["PUT", /^\/api\/admins\/(\d{1,15})$/, admin((req, env, user, [id]) => addAdmin(env.DB, user, id))],
  ["DELETE", /^\/api\/admins\/(\d{1,15})$/, admin((req, env, user, [id]) => removeAdmin(env.DB, user, id))],
  ["GET", /^\/api\/audit$/, admin(async (req, env) => json(await listAudit(env.DB, new URL(req.url))))],
  ["POST", /^\/api\/audit\/(\d{1,12})\/undo$/, admin(async (req, env, user, [id]) => {
    await readJson(req);
    return json(await undo(env, user, await loadSettings(env.DB), id));
  })],
  ["POST", /^\/api\/links$/, write(async (req, env, user, settings) => json(await addLink(env, user, settings, await readJson(req)), 201))],
  ["PATCH", /^\/api\/links\/(\d{1,12})$/, write(async (req, env, user, settings, [id]) => json(await updateLink(env, user, settings, id, await readJson(req))))],
  ["DELETE", /^\/api\/links\/(\d{1,12})$/, write(async (req, env, user, settings, [id]) => {
    await deleteLink(env, user, settings, id);
    return new Response(null, { status: 204 });
  })],
  ["POST", /^\/api\/links\/(\d{1,12})\/move$/, write(async (req, env, user, settings, [id]) => json(await moveLink(env, user, settings, id, await readJson(req))))],
  ["PUT", /^\/api\/titles\/(movie|series)\/(\d{1,9})\/poster$/, write(async (req, env, user, settings, [type, id]) => {
    const target = parseTarget(type, Number(id));
    await setPoster(env, user, settings, target.type, target.tmdbId, await readJson(req));
    return new Response(null, { status: 204 });
  })],
];

function write(handler) {
  return async (request, env, params) => {
    const user = await requireWriter(request, env);
    const settings = await loadSettings(env.DB);
    return handler(request, env, user, settings, params);
  };
}

function admin(handler) {
  return async (request, env, params) => handler(request, env, await requireAdmin(request, env), params);
}

export async function handle(request, env) {
  const { pathname } = new URL(request.url);
  let pathMatched = false;
  for (const [method, pattern, handler] of ROUTES) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    pathMatched = true;
    if (method !== request.method) continue;
    return handler(request, env, match.slice(1));
  }
  return pathMatched ? json({ error: "method not allowed" }, 405) : json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    try {
      if (new URL(request.url).pathname.startsWith("/assets/")) return await serveAsset(request, env);
      return await handle(request, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "internal error" }, 500);
    }
  },
};
