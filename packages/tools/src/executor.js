import { exec } from 'child_process';
import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { promisify } from 'util';
const execAsync = promisify(exec);
/**
 * Executes tool calls returned by agents.
 */
export class ToolExecutor {
    async execute(toolName, args) {
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
            case 'browser_use':
                return this.execBrowserUse(args);
            case 'memory_search':
                return this.execMemorySearch(args);
            default:
                return `Unknown tool: ${toolName}`;
        }
    }
    async execFilesystem(args) {
        const { action, path, content } = args;
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
    async execShell(args) {
        const { command, cwd } = args;
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                timeout: 30_000,
            });
            return stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
        }
        catch (err) {
            return `Error: ${err.message}`;
        }
    }
    async execHttp(args) {
        const { method, url, headers, body } = args;
        const response = await fetch(url, {
            method,
            headers: headers,
            body: method !== 'GET' ? body : undefined,
        });
        const text = await response.text();
        return `${response.status} ${response.statusText}\n${text.slice(0, 5000)}`;
    }
    async execCode(args) {
        const { language, code } = args;
        if (language === 'javascript') {
            try {
                const result = new Function(code)();
                return String(result ?? 'undefined');
            }
            catch (err) {
                return `Error: ${err.message}`;
            }
        }
        // Python: shell out
        if (language === 'python') {
            return this.execShell({ command: `python3 -c ${JSON.stringify(code)}` });
        }
        return `Unsupported language: ${language}`;
    }
    async execWebFetch(args) {
        const { url, maxLength } = args;
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
        }
        catch (err) {
            if (err.name === 'TimeoutError')
                return 'Error: Request timed out (15s)';
            return `Error: ${err.message}`;
        }
    }
    async execWebSearch(args) {
        const { query, maxResults } = args;
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
            const results = [];
            // Split on result__body (may have extra classes before it)
            const resultBlocks = html.split(/result__body">/);
            for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
                const block = resultBlocks[i];
                // Skip ads (the preceding block contains "result--ad")
                const prevTail = resultBlocks[i - 1].slice(-300);
                if (prevTail.includes('result--ad'))
                    continue;
                // Extract title
                const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
                const title = titleMatch?.[1]
                    ?.replace(/&amp;/g, '&')
                    ?.replace(/&quot;/g, '"')
                    ?.replace(/&#x27;/g, "'")
                    ?.trim() ?? '';
                // Extract URL from redirect link
                const urlMatch = block.match(/href="\/\/duckduckgo\.com\/l\/\?[^"]*uddg=([^&"]+)/);
                const url = urlMatch?.[1] ? decodeURIComponent(urlMatch[1]) : '';
                // Extract snippet
                const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
                const snippet = snippetMatch?.[1]
                    ?.replace(/<[^>]+>/g, '')
                    ?.replace(/&quot;/g, '"')
                    ?.replace(/&#x27;/g, "'")
                    ?.replace(/&amp;/g, '&')
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
        }
        catch (err) {
            if (err.name === 'TimeoutError')
                return 'Error: Search timed out (10s)';
            return `Error: ${err.message}`;
        }
    }
    async execBrowserUse(args) {
        const { action, url, index, text, path, code, direction } = args;
        let cmd;
        switch (action) {
            case 'open':
                if (!url)
                    return 'Error: url is required for open action';
                cmd = `browser-use open ${JSON.stringify(url)}`;
                break;
            case 'state':
                cmd = 'browser-use state --json';
                break;
            case 'click':
                if (index === undefined)
                    return 'Error: index is required for click action';
                cmd = `browser-use click ${index}`;
                break;
            case 'type':
                if (!text)
                    return 'Error: text is required for type action';
                cmd = `browser-use type ${JSON.stringify(text)}`;
                break;
            case 'input':
                if (index === undefined || !text)
                    return 'Error: index and text are required for input action';
                cmd = `browser-use input ${index} ${JSON.stringify(text)}`;
                break;
            case 'screenshot':
                cmd = `browser-use screenshot ${JSON.stringify(path ?? '/tmp/screenshot.png')}`;
                break;
            case 'eval':
                if (!code)
                    return 'Error: code is required for eval action';
                cmd = `browser-use eval ${JSON.stringify(code)}`;
                break;
            case 'scroll':
                if (!direction)
                    return 'Error: direction is required for scroll action';
                cmd = `browser-use scroll ${direction}`;
                break;
            case 'close':
                cmd = 'browser-use close';
                break;
            default:
                return `Unknown browser action: ${action}. Valid: open, state, click, type, input, screenshot, eval, scroll, close`;
        }
        try {
            const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000 });
            return stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
        }
        catch (err) {
            if (err.code === 'ENOENT' || err.message?.includes('not found') || err.message?.includes('ENOENT')) {
                return 'Error: browser-use not installed. Run: pip install browser-use && browser-use install';
            }
            return `Error: ${err.message}`;
        }
    }
    async execPriceFeed(args) {
        const asset = (args.asset ?? 'bitcoin').toLowerCase();
        const currency = (args.currency ?? 'usd').toLowerCase();
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 10000);
            const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(asset)}&vs_currencies=${currency}&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;
            const res = await fetch(url, { signal: controller.signal });
            const data = await res.json();
            if (!data[asset]) {
                // Try search API for fuzzy match
                const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(asset)}`;
                const searchRes = await fetch(searchUrl, { signal: controller.signal });
                const searchData = await searchRes.json();
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
        }
        catch (err) {
            if (err.name === 'AbortError')
                return 'Error: Price feed timed out (10s)';
            return `Error fetching price: ${err.message}`;
        }
    }
    async execMemorySearch(args) {
        const query = args.query;
        if (!query)
            return 'Error: query is required';
        try {
            const res = await fetch('http://localhost:3200/api/memory/search?q=' + encodeURIComponent(query));
            const data = await res.json();
            if (data.totalMatches === 0)
                return 'No matches found for: ' + query;
            let result = `Found ${data.totalMatches} matches:\n\n`;
            for (const r of data.results) {
                result += `[${r.partition}]\n`;
                for (const m of r.matches) {
                    result += m.slice(0, 300) + '\n\n';
                }
            }
            return result;
        }
        catch {
            return 'Error: memory search unavailable';
        }
    }
}
//# sourceMappingURL=executor.js.map