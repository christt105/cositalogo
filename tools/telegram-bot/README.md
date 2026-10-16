# Cositeca Telegram bot (retired)

Cloudflare Worker behind the old Cositeca bot, which used to walk people through
a short conversation and open an `Añadir cosita` issue for
`.github/workflows/add-entry.yml`. That issue flow is gone: the catalog now
lives in the Cositálogo D1 and is edited from the web at
https://cositalogo.christt105.workers.dev/.

The Worker now answers every private message, and any button left over from
an old conversation, with a fixed text pointing to that web. It ignores
messages from groups, no longer talks to GitHub (`/github-webhook` answers
404) and no longer searches TMDB. It still deploys from
`deploy-telegram-bot.yml` on pushes to `main` that touch this folder.

Secrets it still reads: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`.

## Local dev

`wrangler dev` needs a `.dev.vars` with those two values (it's gitignored).
`test/telegram-bot-worker.test.js` (`npm test`) covers the replies by calling
the Worker with crafted updates.
