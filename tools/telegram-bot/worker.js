export const WEB_URL = "https://cositalogo.christt105.workers.dev/";

export const RETIRED_TEXT = [
  "Ya no añado cosas al catálogo: ahora se hace desde la web del Cositálogo.",
  "",
  WEB_URL,
  "",
  "Inicia sesión con Telegram desde la propia web y escribe la contraseña de escritura la primera vez (si no la sabes, pídesela a Christian). Después ya puedes añadir, editar y borrar enlaces.",
].join("\n");

/**
 * The bot that used to open "add" issues from a Telegram conversation. The
 * issue flow is frozen, so every message or button press now gets the same
 * answer pointing to the web, and nothing reaches GitHub.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/telegram-webhook") {
      return handleTelegramWebhook(request, env);
    }
    return new Response("not found", { status: 404 });
  },
};

async function handleTelegramWebhook(request, env) {
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json();
  try {
    if (update.callback_query) {
      await tg(env, "answerCallbackQuery", { callback_query_id: update.callback_query.id });
      const chatId = update.callback_query.message?.chat?.id;
      if (chatId) await sendMessage(env, chatId, RETIRED_TEXT);
    } else if (update.message?.chat?.type === "private") {
      await sendMessage(env, update.message.chat.id, RETIRED_TEXT);
    }
  } catch (err) {
    console.error(err);
  }
  return new Response("ok");
}

async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function sendMessage(env, chatId, text) {
  return tg(env, "sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true } });
}
