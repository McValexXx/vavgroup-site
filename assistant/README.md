# VAV Assistant

VAV Assistant is a Cloudflare Worker used by the static VAV Group website. It provides a guided or AI-generated answer from the approved public VAV knowledge base and sends a visitor's separately submitted lead to Valentin's Telegram bot.

## Security model

- Bot tokens, webhook secrets and connection codes are Cloudflare Worker secrets. They are never browser variables and never committed.
- The browser may call only the approved VAV origins. Requests are size-limited, rate-limited and protected by a honeypot.
- Email addresses, phone numbers and Telegram handles are redacted before a message is sent to an AI model.
- Lead contact data is not sent to an AI model. It is delivered only to the connected Telegram admin chat.
- The Telegram webhook validates `X-Telegram-Bot-Api-Secret-Token`.
- The Worker does not keep a persistent transcript database. KV stores only the connected Telegram chat ID and connection time.
- OpenAI is optional. If configured, the Responses API uses `store: false`; otherwise Cloudflare Workers AI is used. If AI is unavailable, approved guided answers remain available.

## One-click connection

Run `connect-vav-assistant.bat` only after the website repository is clean and published.

The launcher:

1. opens Cloudflare's official OAuth flow if needed;
2. deploys the Worker and its KV/AI bindings;
3. requests the BotFather token in a hidden Windows prompt;
4. stores three secrets directly in Cloudflare;
5. registers the protected Telegram webhook and commands;
6. opens the private Telegram connection link;
7. waits for the owner to press **START**;
8. delivers a technical test notification;
9. writes only the public Worker URL and bot username to `public/config/assistant.json`;
10. tests, builds, commits and pushes that public configuration.

Do not paste a BotFather token into chat, email, an issue, a source file or GitHub Actions variables. If a token is exposed, revoke it in BotFather and run the setup again with a new token.

## Manual operations

```powershell
pnpm exec wrangler login
pnpm exec wrangler deploy --config assistant/wrangler.jsonc
pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN --config assistant/wrangler.jsonc
pnpm exec wrangler secret put TELEGRAM_WEBHOOK_SECRET --config assistant/wrangler.jsonc
pnpm exec wrangler secret put TELEGRAM_CONNECT_CODE --config assistant/wrangler.jsonc
```

Optional OpenAI mode:

```powershell
pnpm exec wrangler secret put OPENAI_API_KEY --config assistant/wrangler.jsonc
```

The default model and allowed origins are non-secret values in `wrangler.jsonc`. Review the privacy policy and applicable localization/cross-border-transfer requirements before production activation.
