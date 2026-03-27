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
  private getRoles?: () => Array<{ id: string; name: string; reportsTo: string | null; budgetTier: string; isActive: boolean }>;

  constructor(apiBase: string = 'http://localhost:3200', directRunner?: DirectRunner, getRoles?: () => Array<{ id: string; name: string; reportsTo: string | null; budgetTier: string; isActive: boolean }>) {
    this.apiBase = apiBase;
    this.directRunner = directRunner;
    this.getRoles = getRoles;
  }

  /** Get active role IDs from the current template */
  private getActiveRoleIds(): string[] {
    if (this.getRoles) {
      return this.getRoles()
        .filter(r => r.isActive && r.budgetTier !== 'survive')
        .map(r => r.id);
    }
    return [];
  }

  /** Get the leader role ID (reportsTo === null) */
  private getLeaderId(): string {
    if (this.getRoles) {
      const roles = this.getRoles().filter(r => r.isActive && r.budgetTier !== 'survive');
      const leader = roles.find(r => r.reportsTo === null);
      if (leader) return leader.id;
      if (roles.length > 0) return roles[0].id;
    }
    return 'ceo'; // absolute last resort
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
        // Auto-enrich: if mission mentions prices, pre-fetch real data
        const enrichedGoal = await this.enrichMissionWithData(intent.content);

        // Missions are async — ack immediately, deliver results later
        if (sendFn) {
          // Send acknowledgment
          sendFn({
            chatId: msg.chatId,
            text: `🦞 Mission received: "${intent.content}"\n\nLeader is decomposing. Results will be delivered here when ready...`,
            replyToId: msg.id,
          });

          // Run mission in background, deliver results when done
          this.runMission(enrichedGoal).then(result => {
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
        responseText = await this.runMission(enrichedGoal);
      } else if (intent.type === 'chat') {
        responseText = await this.runChat(intent.role, intent.content);
      } else if (intent.type === 'help') {
        responseText = this.getHelpText();
      } else if (intent.type === 'status') {
        responseText = await this.getStatus();
      } else if (intent.type === 'price') {
        responseText = await this.getPrice(intent.asset);
      } else {
        // Default: chat with leader role
        responseText = await this.runChat(this.getLeaderId(), msg.text);
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

    // Role shortcuts: /<roleId> <msg> — dynamically from active roles
    const roleIds = this.getActiveRoleIds();
    for (const role of roleIds) {
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

    // /price <asset> — direct price lookup, no AI needed
    if (trimmed.startsWith('/price')) {
      const asset = trimmed.slice(6).trim() || 'bitcoin';
      return { type: 'price', asset };
    }

    // Default: chat with leader role
    return { type: 'default', content: trimmed };
  }

  /**
   * Auto-enrich mission with real-time data when it mentions assets/prices.
   * This prevents agents from hallucinating prices.
   */
  private async enrichMissionWithData(goal: string): Promise<string> {
    const lower = goal.toLowerCase();

    // Detect mentioned assets
    const assetPatterns: Array<{ pattern: RegExp; id: string; type: 'crypto' | 'stock' }> = [
      { pattern: /比特币|bitcoin|btc/i, id: 'bitcoin', type: 'crypto' },
      { pattern: /以太坊|ethereum|eth(?!er)/i, id: 'ethereum', type: 'crypto' },
      { pattern: /狗狗币|dogecoin|doge/i, id: 'dogecoin', type: 'crypto' },
      { pattern: /solana|sol(?!ar)/i, id: 'solana', type: 'crypto' },
      { pattern: /特斯拉|tesla|tsla/i, id: 'TSLA', type: 'stock' },
      { pattern: /苹果|apple|aapl/i, id: 'AAPL', type: 'stock' },
      { pattern: /英伟达|nvidia|nvda/i, id: 'NVDA', type: 'stock' },
      { pattern: /谷歌|google|googl/i, id: 'GOOGL', type: 'stock' },
      { pattern: /茅台|moutai/i, id: '600519.SS', type: 'stock' },
      { pattern: /腾讯|tencent/i, id: '0700.HK', type: 'stock' },
      { pattern: /阿里|alibaba|baba/i, id: 'BABA', type: 'stock' },
      { pattern: /微软|microsoft|msft/i, id: 'MSFT', type: 'stock' },
      { pattern: /亚马逊|amazon|amzn/i, id: 'AMZN', type: 'stock' },
    ];

    const matched: string[] = [];
    for (const { pattern, id, type } of assetPatterns) {
      if (pattern.test(goal)) {
        try {
          const priceData = type === 'crypto'
            ? await this.getCryptoPrice(id)
            : await this.getStockPrice(id);
          if (!priceData.startsWith('❌')) {
            // Extract just the key numbers (strip markdown formatting)
            matched.push(priceData.replace(/\*\*/g, '').replace(/_.*_/, '').trim());
          }
        } catch {}
      }
    }

    if (matched.length === 0) return goal;

    return `${goal}\n\n--- REAL-TIME DATA (pre-fetched, use these exact numbers) ---\n${matched.join('\n\n')}`;
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

  /**
   * Direct price lookup — crypto via CoinGecko, stocks via Yahoo Finance.
   * No AI, no cost, instant. Auto-detects asset type.
   */
  private async getPrice(asset: string): Promise<string> {
    // Known crypto aliases
    const cryptoAliases: Record<string, string> = {
      btc: 'bitcoin', eth: 'ethereum', sol: 'solana', doge: 'dogecoin',
      ada: 'cardano', xrp: 'ripple', dot: 'polkadot', avax: 'avalanche-2',
      bnb: 'binancecoin', matic: 'matic-network', link: 'chainlink',
      '比特币': 'bitcoin', '以太坊': 'ethereum', '狗狗币': 'dogecoin',
    };

    // Stock ticker aliases (Chinese names → tickers)
    const stockAliases: Record<string, string> = {
      '苹果': 'AAPL', '特斯拉': 'TSLA', '英伟达': 'NVDA', '谷歌': 'GOOGL',
      '亚马逊': 'AMZN', '微软': 'MSFT', '脸书': 'META', 'meta': 'META',
      '茅台': '600519.SS', '腾讯': '0700.HK', '阿里巴巴': 'BABA', '阿里': 'BABA',
      '百度': 'BIDU', '京东': 'JD', '拼多多': 'PDD', '网易': 'NTES',
      '台积电': 'TSM', '三星': '005930.KS',
    };

    const lower = asset.toLowerCase();
    const cryptoId = cryptoAliases[lower];
    const stockTicker = stockAliases[lower] ?? stockAliases[asset];

    // If it's a known crypto alias, go straight to CoinGecko
    if (cryptoId) return this.getCryptoPrice(cryptoId);

    // If it's a known stock alias, go straight to Yahoo
    if (stockTicker) return this.getStockPrice(stockTicker);

    // If it looks like a stock ticker (all uppercase, 1-5 chars), try stock first
    if (/^[A-Z]{1,5}$/.test(asset)) {
      const stockResult = await this.getStockPrice(asset);
      if (!stockResult.startsWith('❌')) return stockResult;
    }

    // Try crypto
    const cryptoResult = await this.getCryptoPrice(lower);
    if (!cryptoResult.startsWith('❌')) return cryptoResult;

    // Try stock as last resort
    const stockResult = await this.getStockPrice(asset.toUpperCase());
    if (!stockResult.startsWith('❌')) return stockResult;

    return `❌ "${asset}" not found as crypto or stock.\n\nTry: /price bitcoin, /price AAPL, /price 特斯拉`;
  }

  private async getCryptoPrice(id: string): Promise<string> {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json() as Record<string, Record<string, number>>;

      if (!data[id]) return `❌ Crypto "${id}" not found on CoinGecko.`;

      const d = data[id];
      const price = d.usd;
      const cap = d.usd_market_cap;
      const vol = d.usd_24h_vol;
      const change = d.usd_24h_change;

      const fmtPrice = price >= 1
        ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : price.toPrecision(4);

      return `📊 **${id.charAt(0).toUpperCase() + id.slice(1)}** — CoinGecko

**$${fmtPrice}** USD
Market Cap: $${cap ? (cap / 1e9).toFixed(2) + 'B' : 'N/A'}
24h Volume: $${vol ? (vol / 1e9).toFixed(2) + 'B' : 'N/A'}
24h Change: ${change ? (change > 0 ? '+' : '') + change.toFixed(2) + '%' : 'N/A'}

_Free · No AI cost · Direct API_`;
    } catch {
      return '❌ Crypto price feed unavailable.';
    }
  }

  private async getStockPrice(ticker: string): Promise<string> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2d`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'ClawCompany/1.0' },
      });

      if (!res.ok) return `❌ Stock "${ticker}" not found on Yahoo Finance.`;

      const data = await res.json() as any;
      const result = data?.chart?.result?.[0];
      if (!result) return `❌ Stock "${ticker}" not found.`;

      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const prevClose = meta.chartPreviousClose ?? meta.previousClose;
      const change = prevClose ? ((price - prevClose) / prevClose * 100) : null;
      const currency = meta.currency ?? 'USD';
      const name = meta.shortName ?? meta.symbol ?? ticker;
      const cap = meta.marketCap;

      const fmtPrice = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtChange = change !== null
        ? (change > 0 ? '+' : '') + change.toFixed(2) + '%'
        : 'N/A';

      return `📈 **${name}** (${ticker}) — Yahoo Finance

**$${fmtPrice}** ${currency}
${cap ? `Market Cap: $${(cap / 1e9).toFixed(2)}B` : ''}
Change: ${fmtChange}

_Free · No AI cost · Direct API_`;
    } catch {
      return '❌ Stock price feed unavailable.';
    }
  }

  private getHelpText(): string {
    const roleIds = this.getActiveRoleIds();
    const leaderId = this.getLeaderId();
    const roleShortcuts = roleIds.slice(0, 3).map(r => `/${r} <message> — Talk to ${r}`).join('\n');
    return `🦞 **ClawCompany** — Your AI company in a chat.

**Commands:**
/mission <goal> — Give your company a mission
/price <asset> — Real-time price: crypto or stocks (free)
${roleShortcuts}
/chat <role> <message> — Talk to any role
/status — Check company status
/help — Show this help

**Examples:**
/mission Analyze Bitcoin price trends and recommend a strategy
/price bitcoin
/price AAPL
/${leaderId} What's our strategy?

Just type anything to chat with the ${leaderId} directly.`;
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
  | { type: 'price'; asset: string }
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
