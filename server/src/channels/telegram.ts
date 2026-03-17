// ============================================================
// Telegram Adapter — ~60 lines of platform-specific glue
//
// Everything else (intent parsing, response formatting,
// message splitting, error handling) is in ChannelRouter.
//
// Setup:
//   1. Create a bot via @BotFather on Telegram
//   2. Add TELEGRAM_BOT_TOKEN=your_token to .env
//   3. Server auto-starts the bot if token is present
// ============================================================

import type { ChannelAdapter, InboundMessage, OutboundMessage, SendOptions } from './index.js';
import { ChannelRouter } from './index.js';
import type { DirectRunner } from './index.js';

export class TelegramAdapter implements ChannelAdapter {
  readonly name = 'telegram';
  readonly maxMessageLength = 4096;

  private token: string;
  private router: ChannelRouter;
  private polling = false;
  private offset = 0;

  constructor(token: string, apiBase?: string, directRunner?: DirectRunner) {
    this.token = token;
    this.router = new ChannelRouter(apiBase, directRunner);
  }

  async start(): Promise<void> {
    this.polling = true;
    console.log('  🤖 Telegram bot starting...');

    // Verify token
    const me = await this.api('getMe');
    if (!me.ok) throw new Error('Invalid Telegram bot token');
    console.log(`  ✅ Telegram bot @${me.result.username} connected`);

    // Start polling loop
    this.poll();
  }

  async stop(): Promise<void> {
    this.polling = false;
  }

  async sendText(chatId: string, text: string, options?: SendOptions): Promise<void> {
    // Split long messages
    const chunks = ChannelRouter.splitMessage(text, this.maxMessageLength - 100);

    for (let i = 0; i < chunks.length; i++) {
      await this.api('sendMessage', {
        chat_id: chatId,
        text: chunks[i],
        parse_mode: 'Markdown',
        reply_to_message_id: i === 0 ? options?.replyToId : undefined,
      });
    }
  }

  // ──── Internal ────

  private async poll(): Promise<void> {
    while (this.polling) {
      try {
        const updates = await this.api('getUpdates', {
          offset: this.offset,
          timeout: 30,
          allowed_updates: ['message'],
        });

        if (updates.ok && updates.result?.length > 0) {
          for (const update of updates.result) {
            this.offset = update.update_id + 1;
            if (update.message?.text) {
              this.handleUpdate(update.message);
            }
          }
        }
      } catch (err: any) {
        console.error(`  [Telegram] Poll error: ${err.message}`);
        await sleep(5000);
      }
    }
  }

  private async handleUpdate(msg: any): Promise<void> {
    const inbound: InboundMessage = {
      id: String(msg.message_id),
      channel: 'telegram',
      chatId: String(msg.chat.id),
      userId: String(msg.from?.id ?? ''),
      userName: msg.from?.first_name ?? 'User',
      text: msg.text ?? '',
      timestamp: msg.date * 1000,
    };

    console.log(`  [Telegram] ${inbound.userName}: ${inbound.text.slice(0, 50)}`);

    // Send "typing" indicator
    this.api('sendChatAction', { chat_id: inbound.chatId, action: 'typing' }).catch(() => {});

    // Route through shared ChannelRouter (with sendFn for async missions)
    const sendFn = async (out: OutboundMessage) => {
      if (out.text) await this.sendText(out.chatId, out.text, { replyToId: out.replyToId });
    };
    const response = await this.router.handleMessage(inbound, sendFn);

    // Send response back (skip if empty — already sent via sendFn)
    if (response.text) {
      await this.sendText(response.chatId, response.text, {
        replyToId: response.replyToId,
      });
    }
  }

  private async api(method: string, params?: Record<string, unknown>): Promise<any> {
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
    });
    return res.json();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
