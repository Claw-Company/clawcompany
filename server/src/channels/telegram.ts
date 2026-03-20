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
  public lastChatId: string = '';
  public botName: string = '';

  private token: string;
  private router: ChannelRouter;
  private polling = false;
  private offset = 0;
  private onChatIdChange?: (chatId: string) => void;

  constructor(token: string, apiBase?: string, directRunner?: DirectRunner, opts?: { lastChatId?: string; onChatIdChange?: (id: string) => void }) {
    this.token = token;
    this.router = new ChannelRouter(apiBase, directRunner);
    if (opts?.lastChatId) this.lastChatId = opts.lastChatId;
    if (opts?.onChatIdChange) this.onChatIdChange = opts.onChatIdChange;
  }

  async start(): Promise<void> {
    this.polling = true;
    console.log('  🤖 Telegram bot starting...');

    // Verify token
    const me = await this.api('getMe');
    if (!me.ok) throw new Error('Invalid Telegram bot token');
    this.botName = me.result.username ?? '';
    console.log(`  ✅ Telegram bot @${this.botName} connected`);
    if (this.lastChatId) console.log(`     └─ Last chat: ${this.lastChatId} (restored)`);

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
    let retryDelay = 3000;
    let lastError = '';
    let errorCount = 0;

    while (this.polling) {
      try {
        const updates = await this.api('getUpdates', {
          offset: this.offset,
          timeout: 30,
          allowed_updates: ['message'],
        }, 35_000); // 35s fetch timeout (> 30s long poll)

        // Success — reset retry state
        retryDelay = 3000;
        lastError = '';
        errorCount = 0;

        if (updates.ok && updates.result?.length > 0) {
          for (const update of updates.result) {
            this.offset = update.update_id + 1;
            if (update.message?.text) {
              this.handleUpdate(update.message);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Fetch timeout — normal during long operations, just retry
          continue;
        }

        // Only log if error message changed, or every 10th consecutive same error
        errorCount++;
        if (err.message !== lastError) {
          console.error(`  [Telegram] Poll error: ${err.message}`);
          lastError = err.message;
          errorCount = 1;
        } else if (errorCount % 10 === 0) {
          console.error(`  [Telegram] Poll error (x${errorCount}): ${err.message}`);
        }

        // Exponential backoff: 3s → 6s → 12s → 24s → max 30s
        await sleep(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
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

    // Track + persist last chatId for scheduler delivery
    if (inbound.chatId !== this.lastChatId) {
      this.lastChatId = inbound.chatId;
      this.onChatIdChange?.(inbound.chatId);
    }

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

  private async api(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<any> {
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: params ? JSON.stringify(params) : undefined,
        signal: controller.signal,
      });
      return res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
