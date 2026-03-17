// ============================================================
// Channel System — one interface, all chat apps
//
// Architecture:
//   Adapter (platform-specific, ~40 lines each)
//     → ChannelRouter (shared logic, we maintain)
//       → /api/chat or /api/mission (existing engine)
//
// Adding a new chat app = implement ChannelAdapter (receive + send).
// All intent parsing, formatting, error handling is in ChannelRouter.
// ============================================================

// ──────────────────────────────────────────
// Standard message format (platform-agnostic)
// ──────────────────────────────────────────

export interface InboundMessage {
  /** Unique message ID from the platform */
  id: string;
  /** Channel type: 'telegram', 'discord', 'feishu', 'slack', 'webchat' */
  channel: string;
  /** Platform-specific chat/channel/room ID */
  chatId: string;
  /** Platform-specific user ID */
  userId: string;
  /** Display name of the sender */
  userName: string;
  /** The message text */
  text: string;
  /** Timestamp */
  timestamp: number;
}

export interface OutboundMessage {
  /** Where to send it */
  chatId: string;
  /** Message text (may be markdown) */
  text: string;
  /** If true, text is markdown and should be converted to platform format */
  isMarkdown?: boolean;
  /** Optional: reply to specific message */
  replyToId?: string;
}

// ──────────────────────────────────────────
// ChannelAdapter — what each platform implements
// ──────────────────────────────────────────

export interface ChannelAdapter {
  /** Platform name: 'telegram', 'discord', etc. */
  readonly name: string;

  /** Start listening for messages */
  start(): Promise<void>;

  /** Stop listening */
  stop(): Promise<void>;

  /** Send a text message to a chat */
  sendText(chatId: string, text: string, options?: SendOptions): Promise<void>;

  /** Platform-specific max message length */
  readonly maxMessageLength: number;
}

export interface SendOptions {
  /** Reply to a specific message */
  replyToId?: string;
  /** Parse mode: 'markdown', 'html', 'plain' */
  parseMode?: 'markdown' | 'html' | 'plain';
}

// ──────────────────────────────────────────
// ChannelRouter — shared logic (we maintain)
// ──────────────────────────────────────────

export class ChannelRouter {
  private apiBase: string;
  private directRunner?: DirectRunner;

  constructor(apiBase: string = 'http://localhost:3200', directRunner?: DirectRunner) {
    this.apiBase = apiBase;
    this.directRunner = directRunner;
  }

  /**
   * Process an inbound message from any platform.
   * Returns the immediate response text.
   * For missions, sends an ack immediately, then delivers results via sendFn.
   */
  async handleMessage(
    msg: InboundMessage,
    sendFn?: (out: OutboundMessage) => Promise<void>,
  ): Promise<OutboundMessage> {
    const intent = this.parseIntent(msg.text);

    try {
      let responseText: string;

      if (intent.type === 'mission') {
        // Missions are async — ack immediately, deliver results later
        if (sendFn) {
          // Send acknowledgment
          sendFn({
            chatId: msg.chatId,
            text: `🦞 Mission received: "${intent.content}"\n\nCEO is decomposing. Results will be delivered here when ready...`,
            replyToId: msg.id,
          });

          // Run mission in background, deliver results when done
          this.runMission(intent.content).then(result => {
            sendFn({ chatId: msg.chatId, text: result, isMarkdown: true });
          }).catch(err => {
            sendFn({ chatId: msg.chatId, text: `Mission failed: ${err.message}` });
          });

          return {
            chatId: msg.chatId,
            text: '', // Already sent via sendFn
            replyToId: msg.id,
          };
        }
        // No sendFn — wait synchronously (WebChat fallback)
        responseText = await this.runMission(intent.content);
      } else if (intent.type === 'chat') {
        responseText = await this.runChat(intent.role, intent.content);
      } else if (intent.type === 'help') {
        responseText = this.getHelpText();
      } else if (intent.type === 'status') {
        responseText = await this.getStatus();
      } else {
        // Default: chat with CEO
        responseText = await this.runChat('ceo', msg.text);
      }

      return {
        chatId: msg.chatId,
        text: responseText,
        isMarkdown: true,
        replyToId: msg.id,
      };
    } catch (err: any) {
      return {
        chatId: msg.chatId,
        text: `Error: ${err.message}`,
        replyToId: msg.id,
      };
    }
  }

  /**
   * Parse user intent from message text.
   * Commands:
   *   /mission <goal>    → run a full mission
   *   /chat <role> <msg> → chat with specific role
   *   /ceo <msg>         → shortcut for /chat ceo <msg>
   *   /help              → show available commands
   *   /status            → company status
   *   (plain text)       → default chat with CEO
   */
  private parseIntent(text: string): Intent {
    const trimmed = text.trim();

    if (trimmed.startsWith('/mission ')) {
      return { type: 'mission', content: trimmed.slice(9).trim() };
    }

    if (trimmed.startsWith('/chat ')) {
      const parts = trimmed.slice(6).trim();
      const spaceIdx = parts.indexOf(' ');
      if (spaceIdx > 0) {
        return {
          type: 'chat',
          role: parts.slice(0, spaceIdx).toLowerCase(),
          content: parts.slice(spaceIdx + 1).trim(),
        };
      }
    }

    // Role shortcuts: /ceo, /cto, /cfo, /cmo, /researcher, /analyst, /engineer
    const roleShortcuts = ['ceo', 'cto', 'cfo', 'cmo', 'researcher', 'analyst', 'engineer', 'secretary', 'worker'];
    for (const role of roleShortcuts) {
      if (trimmed.startsWith(`/${role} `)) {
        return { type: 'chat', role, content: trimmed.slice(role.length + 2).trim() };
      }
    }

    if (trimmed === '/help' || trimmed === '/start') {
      return { type: 'help' };
    }

    if (trimmed === '/status') {
      return { type: 'status' };
    }

    // Default: chat with CEO
    return { type: 'default', content: trimmed };
  }

  private async runMission(goal: string): Promise<string> {
    // Direct runner — no HTTP, no timeout issues
    if (this.directRunner) {
      const report = await this.directRunner.runMission(goal);
      return this.formatMissionReport(report);
    }

    // Fallback: HTTP API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

    try {
      const res = await fetch(`${this.apiBase}/api/mission/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission: goal }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (data.error) return `Mission failed: ${data.error}`;
      return this.formatMissionReport(data);
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatMissionReport(data: any): string {
    let output = `**Mission complete** · $${typeof data.totalCost === 'number' ? data.totalCost.toFixed(4) : data.totalCost} · ${data.totalTimeSeconds}s\n\n`;
    for (const ws of data.workStreams ?? []) {
      const icon = ws.status === 'completed' ? '✅' : '❌';
      output += `${icon} **${ws.title}** (${ws.assignedTo})\n`;
      if (ws.output && ws.status === 'completed') {
        const preview = ws.output.length > 500
          ? ws.output.slice(0, 500) + '\n...(truncated)'
          : ws.output;
        output += `${preview}\n\n`;
      }
    }
    return output;
  }

  private async runChat(role: string, message: string): Promise<string> {
    // Direct runner — no HTTP
    if (this.directRunner) {
      const data = await this.directRunner.runChat(role, message);
      return `${data.content}\n\n_${data.model} · $${data.cost.toFixed(4)}_`;
    }

    // Fallback: HTTP API
    const res = await fetch(`${this.apiBase}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, message }),
    });

    const data = await res.json();
    if (data.error) return `Error: ${data.error}`;

    const cost = data.usage?.cost?.toFixed(4) ?? '0';
    return `${data.content}\n\n_${data.model} · $${cost}_`;
  }

  private async getStatus(): Promise<string> {
    try {
      const res = await fetch(`${this.apiBase}/api/health`);
      const data = await res.json();
      return data.status === 'ok'
        ? '🦞 ClawCompany is online and ready.'
        : `⚠️ Status: ${data.error ?? 'unknown issue'}`;
    } catch {
      return '❌ Cannot connect to ClawCompany server.';
    }
  }

  private getHelpText(): string {
    return `🦞 **ClawCompany** — Your AI company in a chat.

**Commands:**
/mission <goal> — Give your company a mission
/ceo <message> — Talk to the CEO
/cto <message> — Talk to the CTO
/chat <role> <message> — Talk to any role
/status — Check company status
/help — Show this help

**Examples:**
/mission Analyze Bitcoin price trends and recommend a strategy
/ceo What's our competitive advantage?
/cto Review the authentication architecture

Just type anything to chat with the CEO directly.`;
  }

  /**
   * Split a long message into chunks that fit the platform's limit.
   * Splits at paragraph boundaries when possible.
   */
  static splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at paragraph boundary
      let splitAt = remaining.lastIndexOf('\n\n', maxLength);
      if (splitAt < maxLength * 0.3) {
        // No good paragraph break, try single newline
        splitAt = remaining.lastIndexOf('\n', maxLength);
      }
      if (splitAt < maxLength * 0.3) {
        // No good newline, split at space
        splitAt = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitAt < maxLength * 0.3) {
        // No good split point, hard cut
        splitAt = maxLength;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
  }
}

// ──────────────────────────────────────────
// Intent types (internal)
// ──────────────────────────────────────────

type Intent =
  | { type: 'mission'; content: string }
  | { type: 'chat'; role: string; content: string }
  | { type: 'help' }
  | { type: 'status' }
  | { type: 'default'; content: string };

/**
 * Direct runner — bypasses HTTP, calls orchestrator in-process.
 * Eliminates the self-request timeout problem.
 */
export interface DirectRunner {
  runMission(goal: string): Promise<{
    totalCost: number;
    totalTimeSeconds: number;
    workStreams: Array<{ title: string; assignedTo: string; status: string; output: string }>;
  }>;
  runChat(role: string, message: string): Promise<{ content: string; model: string; cost: number }>;
}
