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

- Set `WEB_ADMIN_TOKEN` to a long private token before using the panel.
- Set `WEB_PORT` if your host does not use `PORT`.
- Open `http://localhost:3000` locally, or your deployed service URL online.
- The website can view runtime status, cases, warnings, notes, settings, AutoMod toggles, rule limits, lists, exemptions, and rule actions.
- Direct kick, ban, timeout, and DM actions stay in Discord until the website has Discord OAuth and role checks.

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
