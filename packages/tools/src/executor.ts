import { exec } from 'child_process';
import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Executes tool calls returned by agents.
 */
export class ToolExecutor {
  async execute(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    switch (toolName) {
      case 'filesystem':
        return this.execFilesystem(args);
      case 'shell':
        return this.execShell(args);
      case 'http':
        return this.execHttp(args);
      case 'code_interpreter':
        return this.execCode(args);
      case 'web_fetch':
        return this.execWebFetch(args);
      case 'web_search':
        return this.execWebSearch(args);
      case 'price_feed':
        return this.execPriceFeed(args);
      default:
        return `Unknown tool: ${toolName}`;
    }
  }

  private async execFilesystem(args: Record<string, unknown>): Promise<string> {
    const { action, path, content } = args as {
      action: string;
      path: string;
      content?: string;
    };

    switch (action) {
      case 'read':
        return readFile(path, 'utf-8');
      case 'write':
        await writeFile(path, content ?? '');
        return `Written to ${path}`;
      case 'list':
        return (await readdir(path)).join('\n');
      case 'delete':
        await unlink(path);
        return `Deleted ${path}`;
      default:
        return `Unknown filesystem action: ${action}`;
    }
  }

  private async execShell(args: Record<string, unknown>): Promise<string> {
    const { command, cwd } = args as { command: string; cwd?: string };
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: 30_000,
      });
      return stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }

  private async execHttp(args: Record<string, unknown>): Promise<string> {
    const { method, url, headers, body } = args as {
      method: string;
      url: string;
      headers?: Record<string, string>;
      body?: string;
    };

    const response = await fetch(url, {
      method,
      headers: headers as HeadersInit,
      body: method !== 'GET' ? body : undefined,
    });

    const text = await response.text();
    return `${response.status} ${response.statusText}\n${text.slice(0, 5000)}`;
  }

  private async execCode(args: Record<string, unknown>): Promise<string> {
    const { language, code } = args as { language: string; code: string };

    if (language === 'javascript') {
      try {
        const result = new Function(code)();
        return String(result ?? 'undefined');
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }

    // Python: shell out
    if (language === 'python') {
      return this.execShell({ command: `python3 -c ${JSON.stringify(code)}` });
    }

    return `Unsupported language: ${language}`;
  }

  private async execWebFetch(args: Record<string, unknown>): Promise<string> {
    const { url, maxLength } = args as { url: string; maxLength?: number };
    const limit = maxLength ?? 8000;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ClawCompany/1.0 (AI Agent)',
          'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get('content-type') ?? '';
      const raw = await response.text();

      // JSON → return as-is (truncated)
      if (contentType.includes('application/json')) {
        return raw.slice(0, limit);
      }

      // HTML → strip tags, extract text content
      if (contentType.includes('text/html')) {
        const text = raw
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
        return text.slice(0, limit);
      }

      // Plain text
      return raw.slice(0, limit);
    } catch (err: any) {
      if (err.name === 'TimeoutError') return 'Error: Request timed out (15s)';
      return `Error: ${err.message}`;
    }
  }

  private async execWebSearch(args: Record<string, unknown>): Promise<string> {
    const { query, maxResults } = args as { query: string; maxResults?: number };
    const limit = Math.min(maxResults ?? 5, 10);

    try {
      // Use DuckDuckGo HTML search (no API key needed)
      const encoded = encodeURIComponent(query);
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encoded}`, {
        headers: {
          'User-Agent': 'ClawCompany/1.0 (AI Agent)',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return `Error: Search failed with HTTP ${response.status}`;
      }

      const html = await response.text();

      // Parse DuckDuckGo HTML results
      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const resultBlocks = html.split('class="result__body"');

      for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
        const block = resultBlocks[i];

        // Extract title
        const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
        const title = titleMatch?.[1]?.trim() ?? '';

        // Extract URL
        const urlMatch = block.match(/href="\/\/duckduckgo\.com\/l\/\?[^"]*uddg=([^&"]+)/);
        const url = urlMatch?.[1] ? decodeURIComponent(urlMatch[1]) : '';

        // Extract snippet
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
        const snippet = snippetMatch?.[1]
          ?.replace(/<[^>]+>/g, '')
          ?.replace(/\s+/g, ' ')
          ?.trim() ?? '';

        if (title && url) {
          results.push({ title, url, snippet });
        }
      }

      if (results.length === 0) {
        return `No results found for "${query}"`;
      }

      // Format as readable text
      let output = `Search results for "${query}":\n\n`;
      for (let i = 0; i < results.length; i++) {
        output += `${i + 1}. ${results[i].title}\n`;
        output += `   URL: ${results[i].url}\n`;
        if (results[i].snippet) {
          output += `   ${results[i].snippet}\n`;
        }
        output += '\n';
      }
      return output;
    } catch (err: any) {
      if (err.name === 'TimeoutError') return 'Error: Search timed out (10s)';
      return `Error: ${err.message}`;
    }
  }

  private async execPriceFeed(args: Record<string, unknown>): Promise<string> {
    const asset = (args.asset as string ?? 'bitcoin').toLowerCase();
    const currency = (args.currency as string ?? 'usd').toLowerCase();

    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);

      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(asset)}&vs_currencies=${currency}&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;

      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json() as Record<string, Record<string, number>>;

      if (!data[asset]) {
        // Try search API for fuzzy match
        const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(asset)}`;
        const searchRes = await fetch(searchUrl, { signal: controller.signal });
        const searchData = await searchRes.json() as { coins: Array<{ id: string; name: string; symbol: string }> };

        if (searchData.coins?.length > 0) {
          const match = searchData.coins[0];
          return `Asset "${asset}" not found. Did you mean "${match.id}" (${match.name}, ${match.symbol})? Try again with the correct ID.`;
        }
        return `Asset "${asset}" not found on CoinGecko. Check the asset ID.`;
      }

      const d = data[asset];
      const price = d[currency];
      const marketCap = d[`${currency}_market_cap`];
      const vol24h = d[`${currency}_24h_vol`];
      const change24h = d[`${currency}_24h_change`];

      return `${asset.toUpperCase()} Price Feed (real-time from CoinGecko):
  Price: $${price?.toLocaleString() ?? 'N/A'} ${currency.toUpperCase()}
  Market Cap: $${marketCap ? (marketCap / 1e9).toFixed(2) + 'B' : 'N/A'}
  24h Volume: $${vol24h ? (vol24h / 1e9).toFixed(2) + 'B' : 'N/A'}
  24h Change: ${change24h?.toFixed(2) ?? 'N/A'}%`;
    } catch (err: any) {
      if (err.name === 'AbortError') return 'Error: Price feed timed out (10s)';
      return `Error fetching price: ${err.message}`;
    }
  }
}
