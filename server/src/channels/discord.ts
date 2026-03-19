// ============================================================
// Discord Adapter — raw API, no discord.js dependency
//
// Uses Discord Gateway (WebSocket) for receiving messages
// and REST API for sending responses.
//
// Setup:
//   1. Create app at discord.com/developers/applications
//   2. Add a Bot, copy token
//   3. Enable MESSAGE CONTENT intent in Bot settings
//   4. Invite bot to server with URL:
//      https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&permissions=2048&scope=bot
//   5. Add DISCORD_BOT_TOKEN=your_token to .env
//   6. Server auto-starts the bot if token is present
// ============================================================

import type { ChannelAdapter, InboundMessage, OutboundMessage, SendOptions } from './index.js';
import { ChannelRouter } from './index.js';
import type { DirectRunner } from './index.js';

const API_BASE = 'https://discord.com/api/v10';
const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

export class DiscordAdapter implements ChannelAdapter {
  readonly name = 'discord';
  readonly maxMessageLength = 2000;
  public lastChatId: string = '';
  public botName: string = '';

  private token: string;
  private router: ChannelRouter;
  private ws: any = null;
  private heartbeatInterval: any = null;
  private sequence: number | null = null;
  private botUserId: string = '';
  private running = false;

  constructor(token: string, apiBase?: string, directRunner?: DirectRunner) {
    this.token = token;
    this.router = new ChannelRouter(apiBase, directRunner);
  }

  async start(): Promise<void> {
    this.running = true;
    console.log('  🎮 Discord bot starting...');

    // Verify token
    const me = await this.rest('GET', '/users/@me');
    if (!me.id) throw new Error('Invalid Discord bot token');
    this.botUserId = me.id;
    this.botName = `${me.username}#${me.discriminator}`;
    console.log(`  ✅ Discord bot ${this.botName} connected`);

    // Connect to Gateway
    await this.connectGateway();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.ws) this.ws.close();
  }

  async sendText(channelId: string, text: string, options?: SendOptions): Promise<void> {
    const chunks = ChannelRouter.splitMessage(text, this.maxMessageLength - 50);

    for (const chunk of chunks) {
      const body: Record<string, unknown> = { content: chunk };
      if (options?.replyToId) {
        body.message_reference = { message_id: options.replyToId };
      }
      await this.rest('POST', `/channels/${channelId}/messages`, body);
    }
  }

  // ──── Gateway WebSocket ────

  private async connectGateway(): Promise<void> {
    this.ws = new WebSocket(GATEWAY_URL);

    this.ws.onopen = () => {};

    this.ws.onmessage = (event: any) => {
      const raw = typeof event.data === 'string' ? event.data : event.data.toString();
      const data = JSON.parse(raw);
      this.handleGatewayEvent(data);
    };

    this.ws.onclose = (event: any) => {
      if (this.running) {
        console.log(`  [Discord] Gateway closed (${event.code}), reconnecting in 5s...`);
        setTimeout(() => this.connectGateway(), 5000);
      }
    };

    this.ws.onerror = (event: any) => {
      console.error(`  [Discord] Gateway error`);
    };
  }

  private handleGatewayEvent(data: any): void {
    const { op, t, s, d } = data;

    // Update sequence for heartbeat
    if (s) this.sequence = s;

    switch (op) {
      case 10: // Hello — start heartbeat + identify
        this.startHeartbeat(d.heartbeat_interval);
        this.identify();
        break;

      case 11: // Heartbeat ACK
        break;

      case 0: // Dispatch
        if (t === 'MESSAGE_CREATE') {
          this.handleMessage(d);
        }
        break;
    }
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    // Send first heartbeat with jitter
    setTimeout(() => {
      this.sendGateway(1, this.sequence);
    }, intervalMs * Math.random());

    this.heartbeatInterval = setInterval(() => {
      this.sendGateway(1, this.sequence);
    }, intervalMs);
  }

  private identify(): void {
    this.sendGateway(2, {
      token: this.token,
      intents: (1 << 9) | (1 << 15), // GUILD_MESSAGES + MESSAGE_CONTENT
      properties: {
        os: 'linux',
        browser: 'clawcompany',
        device: 'clawcompany',
      },
    });
  }

  private sendGateway(op: number, d: unknown): void {
    if (this.ws?.readyState === 1) { // WebSocket.OPEN = 1
      this.ws.send(JSON.stringify({ op, d }));
    }
  }

  // ──── Message handling ────

  private async handleMessage(msg: any): Promise<void> {
    // Ignore own messages and other bots
    if (msg.author?.id === this.botUserId) return;
    if (msg.author?.bot) return;

    // Only respond to messages that mention the bot or are in DMs
    const isDM = !msg.guild_id;
    const mentionsBot = msg.mentions?.some((m: any) => m.id === this.botUserId);
    const startsWithCommand = msg.content?.startsWith('/');

    if (!isDM && !mentionsBot && !startsWithCommand) return;

    // Strip bot mention from message
    let text = msg.content ?? '';
    text = text.replace(new RegExp(`<@!?${this.botUserId}>`, 'g'), '').trim();

    if (!text) return;

    const inbound: InboundMessage = {
      id: msg.id,
      channel: 'discord',
      chatId: msg.channel_id,
      userId: msg.author?.id ?? '',
      userName: msg.author?.username ?? 'User',
      text,
      timestamp: new Date(msg.timestamp).getTime(),
    };

    console.log(`  [Discord] ${inbound.userName}: ${text.slice(0, 50)}`);

    // Track last chatId for scheduler delivery
    this.lastChatId = inbound.chatId;

    // Show typing indicator
    this.rest('POST', `/channels/${msg.channel_id}/typing`).catch(() => {});

    // Route through shared ChannelRouter (with sendFn for async missions)
    const sendFn = async (out: OutboundMessage) => {
      if (out.text) await this.sendText(out.chatId, out.text, { replyToId: out.replyToId });
    };
    const response = await this.router.handleMessage(inbound, sendFn);

    // Send response (skip if empty — already sent via sendFn)
    if (response.text) {
      await this.sendText(response.chatId, response.text, {
        replyToId: response.replyToId,
      });
    }
  }

  // ──── REST API ────

  private async rest(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bot ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      if (res.status === 429) {
        // Rate limited — wait and retry
        const retry = JSON.parse(err)?.retry_after ?? 1;
        await sleep(retry * 1000);
        return this.rest(method, path, body);
      }
      throw new Error(`Discord API ${res.status}: ${err}`);
    }

    return res.json().catch(() => ({}));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
