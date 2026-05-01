# Mochi Bot

Discord bot for server utilities, role verification, and moderation commands.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file with:

```env
TOKEN=
CLIENT_ID=
GUILD_ID=
ENABLE_CORE_BOT=true
WEB_PORT=3000
WEB_ADMIN_TOKEN=
WEB_BASE_URL=
DISCORD_CLIENT_SECRET=
SESSION_SECRET=
OPENAI_API_KEY=
OPENAI_SUMMARY_MODEL=gpt-4o-mini
VERIFY_CHANNEL_ID=
RULES_CHANNEL_ID=
LOG_CHANNEL_ID=
SAKURA_ROLE_ID=
STRAWBERRY_ROLE_ID=
MATCHA_ROLE_ID=
MYSTIC_ROLE_ID=
TARO_ROLE_ID=
```

3. Start the bot:

```bash
npm start
```

## Deploy online

This project is ready for simple Node hosting on Railway, Render, or a VPS.

## Web moderation panel

The bot serves a web dashboard from the same Node process.

- Set `DISCORD_CLIENT_SECRET` and `SESSION_SECRET` to enable Discord login.
- Add your deployed callback URL in the Discord Developer Portal: `https://your-domain/auth/callback`.
- Set `WEB_BASE_URL` to your deployed URL if your host does not infer it correctly.
- Set `WEB_ADMIN_TOKEN` to a long private token if you want backup token access.
- Set `WEB_PORT` if your host does not use `PORT`.
- Open `http://localhost:3000` locally, or your deployed service URL online.
- The website can view runtime status, cases, warnings, notes, settings, AutoMod toggles, rule limits, lists, exemptions, rule actions, and member profiles.
- The web panel opens on a dedicated login screen before exposing moderation controls.
- Staff can search members and run web moderation actions including warn, note, timeout, mute, unmute, clear warnings, kick, ban, and tempban. Risky actions ask for browser confirmation.
- Records include case filters and a unified timeline. AutoMod includes duration and age-gate controls for escalation, raids, links, and attachments.
- Optional AI moderation can be enabled from the AutoMod tab after setting `OPENAI_API_KEY`. AI review starts as alert-only via the `ai-review` rule and appears in the AI Review tab and AutoMod cases.
- AI custom server rules can be added in the AutoMod lists section. When enabled, they flag server-specific rule issues into the same AI Review queue.
- AI moderation settings include thresholds, minimum message length, optional recent-message context, and extra moderator guidance.
- The AutoMod workspace includes the AI Review queue so rule tuning and AI decisions live together.
- Member profiles include an optional AI risk summary after `OPENAI_API_KEY` is configured. The summary can fill the moderation form, but staff still apply actions manually.
- The Ops tab includes moderation templates, risk/strike signals, appeals, audit logs, config backup/restore, channel profile notes, and scheduled report settings.

### Railway

1. Push this folder to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Add all variables from your local `.env` into Railway's Variables tab.
4. Railway will detect Node automatically and run `npm start`.

### Render

1. Push this folder to GitHub.
2. Create a new `Web Service` in Render from the repo.
3. Set:
   - Build command: `npm install`
   - Start command: `npm start`
   - Node version: `20`
4. Add the same environment variables from `.env`.

## Notes for hosting

- Do not upload your local `.env` file.
- The bot now tries to rediscover the verify message in the verify channel after restarts, which makes redeploys safer on hosts with ephemeral filesystems.
- If you create a new verify message with `/setupverify`, the latest message id is saved in `data/config.json`.
- `ENABLE_CORE_BOT` controls moderation, setup, and other core server features.
