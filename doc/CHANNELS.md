# Channel System — Chat App Integration

> One interface. All platforms. Add a new chat app in 40 lines.

---

## Architecture

```
Telegram / Discord / Feishu / Slack / WebChat / ...
    ↓
ChannelAdapter (platform-specific, ~40 lines)
    ↓
ChannelRouter (shared logic, we maintain)
    ↓
/api/chat + /api/mission (existing engine)
```

**Two layers, strict separation:**

- **ChannelAdapter** — knows only how to receive from and send to a specific platform. Nothing else.
- **ChannelRouter** — knows intent parsing, response formatting, message splitting, error handling. Platform-agnostic.

Adding a new chat app = implement `ChannelAdapter` interface. All business logic stays in `ChannelRouter`.

---

## ChannelAdapter Interface

```typescript
interface ChannelAdapter {
  name: string;                    // 'telegram', 'discord', etc.
  maxMessageLength: number;        // platform limit
  start(): Promise<void>;          // start listening
  stop(): Promise<void>;           // stop listening
  sendText(chatId, text, opts?);   // send message back
}
```

That's it. Each adapter receives messages from its platform, converts to `InboundMessage` format, passes to `ChannelRouter.handleMessage()`, and sends the response back.

---

## Standard Message Format

```typescript
interface InboundMessage {
  id: string;        // platform message ID
  channel: string;   // 'telegram', 'discord', etc.
  chatId: string;    // platform chat/channel ID
  userId: string;    // platform user ID
  userName: string;  // display name
  text: string;      // message text
  timestamp: number; // unix ms
}
```

All adapters convert platform-specific message formats into this standard format. ChannelRouter only sees `InboundMessage` — never platform-specific objects.

---

## Commands

```
/mission <goal>          Run a full mission
/ceo <message>           Chat with CEO
/cto <message>           Chat with CTO
/chat <role> <message>   Chat with any role
/status                  Check company status
/help                    Show commands
(plain text)             Default: chat with CEO
```

---

## Setup

### Telegram
1. Message @BotFather on Telegram, create a bot
2. Copy the token
3. Add to `.env`: `TELEGRAM_BOT_TOKEN=your_token`
4. Restart server — bot auto-connects

### Discord (planned)
1. Create Discord Application + Bot
2. Add `DISCORD_BOT_TOKEN=your_token` to `.env`

### Feishu (planned)
1. Create Feishu app, configure webhook
2. Add `FEISHU_APP_ID` + `FEISHU_APP_SECRET` to `.env`

---

## Design Principles

1. **Adapter knows nothing about business logic.** It doesn't know what a "mission" is or what roles exist. It just receives text and sends text.

2. **Router knows nothing about platforms.** It doesn't know Telegram's message format or Discord's embed system. It just processes `InboundMessage` and returns text.

3. **One change, all platforms.** Fix a bug in intent parsing? It's in `ChannelRouter` — fixed for every platform at once.

4. **Easy to test.** Mock `ChannelRouter.handleMessage()` with a fake `InboundMessage` — no platform SDK needed.

5. **Same "shelf" logic.** Built-in: WebChat + Telegram + Discord. ClawMall: Feishu, Slack, WhatsApp. Partners: WeChat, LINE, Teams.
