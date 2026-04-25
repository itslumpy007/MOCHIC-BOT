# Mochi Bot

Discord bot for server utilities, role verification, moderation commands, and TikTok LIVE notifications.

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
ENABLE_MUSIC=true
VERIFY_CHANNEL_ID=
RULES_CHANNEL_ID=
LOG_CHANNEL_ID=
TIKTOK_USERNAME=
TIKTOK_CHANNEL_ID=
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

## Split core bot and music bot

You can run this repo as two separate deployments:

- `Core bot` for moderation, admin panel, AutoMod, verification, and TikTok
- `Music bot` for voice and `/musicpanel`

Use these environment flags:

```env
ENABLE_CORE_BOT=true
ENABLE_MUSIC=false
```

for the main Railway deployment, and:

```env
ENABLE_CORE_BOT=false
ENABLE_MUSIC=true
```

for the separate music deployment.

For the cleanest setup, use a separate Discord bot token for the music deployment so the two services do not fight over the same bot session.

### Railway

1. Push this folder to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Add all variables from your local `.env` into Railway's Variables tab.
4. Railway will detect Node automatically and run `npm start`.

For a split setup, create a second service for music on a voice-friendly host and set its feature flags separately.

### Render

1. Push this folder to GitHub.
2. Create a new `Background Worker` in Render from the repo.
3. Set:
   - Build command: `npm install`
   - Start command: `npm start`
   - Node version: `20`
4. Add the same environment variables from `.env`.

## Notes for hosting

- Do not upload your local `.env` file.
- The bot now tries to rediscover the verify message in the verify channel after restarts, which makes redeploys safer on hosts with ephemeral filesystems.
- If you create a new verify message with `/setupverify`, the latest message id is saved in `data/config.json`.
- `ENABLE_CORE_BOT` controls moderation, setup, TikTok, and other non-music features.
- `ENABLE_MUSIC` controls `/play`, `/musicpanel`, and the voice queue system.
