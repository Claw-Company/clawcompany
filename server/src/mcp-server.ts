#!/usr/bin/env node
/**
 * ClawCompany MCP Server
 *
 * Exposes ClawCompany tools (web_search, web_fetch, company_memory, etc.)
 * over the Model Context Protocol (stdio transport).
 *
 * Usage:
 *   npx tsx server/src/mcp-server.ts
 *   claude mcp add clawcompany -- npx tsx server/src/mcp-server.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v4';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { ToolExecutor } from '../../packages/tools/src/executor.js';

// ── Memory helpers (mirrors server/src/index.ts logic) ──
const clawDir = `${process.env.HOME}/.clawcompany`;
const chairmanPath = `${clawDir}/chairman.md`;
const memoryDir = `${clawDir}/memory`;
const MEMORY_PARTITIONS = ['culture', 'decisions', 'learnings', 'tech-stack'] as const;
type MemoryPartition = typeof MEMORY_PARTITIONS[number];

function ensureClawDir() {
  if (!existsSync(clawDir)) mkdirSync(clawDir, { recursive: true });
}

function loadChairman(): string {
  try {
    if (existsSync(chairmanPath)) return readFileSync(chairmanPath, 'utf-8');
  } catch {}
  return '';
}

function loadPartition(p: MemoryPartition): string {
  try {
    const fp = `${memoryDir}/${p}.md`;
    if (existsSync(fp)) return readFileSync(fp, 'utf-8');
  } catch {}
  return '';
}

function loadMemory(): string {
  return MEMORY_PARTITIONS.map(p => loadPartition(p)).filter(s => s.trim()).join('\n\n---\n\n');
}

function categorizeMemoryEntry(entry: string): MemoryPartition {
  const lower = entry.toLowerCase();

  if (/\b(decided|chose|selected|switched to|changed to|adopted|approved|rejected|committed to)\b/.test(lower) ||
      /\b(决定|选择|采用|切换|更换|批准|否决)\b/.test(lower) ||
      /\b(provider|template|strategy|policy|priority)\b/.test(lower)) {
    return 'decisions';
  }

  if (/\b(install|package|dependency|framework|library|stack|runtime|deploy|hosting|database|sdk|compiler|bundler)\b/.test(lower) ||
      /\b(typescript|javascript|node|react|vue|python|docker|vercel|pnpm|npm|git)\b/.test(lower) ||
      /\b(安装|部署|技术栈|框架|依赖)\b/.test(lower)) {
    return 'tech-stack';
  }

  if (/\b(principle|value|culture|motto|philosophy|vision|mission statement|belief|tradition)\b/.test(lower) ||
      /\b(原则|文化|理念|价值观|使命|愿景|口号)\b/.test(lower) ||
      /\b(customer.first|team.spirit|code.quality)\b/.test(lower)) {
    return 'culture';
  }

  return 'learnings';
}

function appendMemory(entry: string, partition: MemoryPartition = 'learnings'): void {
  try {
    ensureClawDir();
    if (!existsSync(memoryDir)) mkdirSync(memoryDir, { recursive: true });
    const fp = `${memoryDir}/${partition}.md`;
    if (!existsSync(fp)) writeFileSync(fp, '');
    const existing = loadPartition(partition);
    const newContent =
      existing +
      '\n\n---\n\n' +
      `[${new Date().toISOString().slice(0, 10)}] ${entry}`;
    writeFileSync(fp, newContent);
  } catch {}
}

function searchMemory(query: string): { partition: string; matches: string[] }[] {
  const results: { partition: string; matches: string[] }[] = [];
  const queryLower = query.toLowerCase();
  const keywords = queryLower.split(/\s+/).filter(k => k.length > 1);

  const chairman = loadChairman();
  if (chairman && keywords.some(k => chairman.toLowerCase().includes(k))) {
    results.push({ partition: 'chairman', matches: [chairman] });
  }

  for (const p of MEMORY_PARTITIONS) {
    const content = loadPartition(p);
    if (!content.trim()) continue;
    const entries = content.split('---').map(s => s.trim()).filter(s => s);
    const matched = entries.filter(entry =>
      keywords.some(k => entry.toLowerCase().includes(k))
    );
    if (matched.length > 0) {
      results.push({ partition: p, matches: matched });
    }
  }

  return results;
}

// ── Tool executor ──
const executor = new ToolExecutor();

// ── MCP Server ──
const server = new McpServer({
  name: 'clawcompany',
  version: '0.1.0',
});

// ────── Tools ──────

server.tool(
  'web_search',
  'Search the web using DuckDuckGo. Returns titles, URLs, and snippets.',
  {
    query: z.string().describe('Search query'),
    maxResults: z.number().optional().describe('Max results (default 5, max 10)'),
  },
  async ({ query, maxResults }) => {
    const result = await executor.execute('web_search', { query, maxResults });
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'web_fetch',
  'Fetch and extract text content from a web page. Strips HTML tags.',
  {
    url: z.string().describe('URL of the web page to fetch'),
    maxLength: z.number().optional().describe('Max characters to return (default 8000)'),
  },
  async ({ url, maxLength }) => {
    const result = await executor.execute('web_fetch', { url, maxLength });
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'company_memory',
  'Read or append to ClawCompany shared memory (partitions: culture, decisions, learnings, tech-stack)',
  {
    action: z.enum(['read', 'append', 'search']).describe('Read all memory, append a new entry, or search memory'),
    partition: z.enum(['culture', 'decisions', 'learnings', 'tech-stack']).optional().describe('Memory partition (default: all for read, learnings for append)'),
    entry: z.string().optional().describe('New memory entry to append (required for append), or search query (required for search)'),
  },
  async ({ action, partition, entry }) => {
    if (action === 'read') {
      if (partition) {
        const content = loadPartition(partition);
        return { content: [{ type: 'text', text: content || `(empty — no ${partition} entries yet)` }] };
      }
      // Return all partitions + chairman
      const chairman = loadChairman();
      let result = '';
      if (chairman.trim()) result += `--- Chairman ---\n${chairman}\n\n`;
      for (const p of MEMORY_PARTITIONS) {
        const c = loadPartition(p);
        if (c.trim()) result += `--- ${p} ---\n${c}\n\n`;
      }
      return { content: [{ type: 'text', text: result || '(empty — no memory entries yet)' }] };
    }
    if (action === 'search') {
      if (!entry) {
        return {
          content: [{ type: 'text', text: 'Error: query required for search (pass as entry)' }],
          isError: true,
        };
      }
      const results = searchMemory(entry);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No matches found for: ' + entry }] };
      }
      let text = `Search results for "${entry}":\n\n`;
      for (const r of results) {
        text += `[${r.partition}]\n`;
        for (const m of r.matches) {
          text += m.slice(0, 200) + '\n\n';
        }
      }
      return { content: [{ type: 'text', text }] };
    }
    // append
    if (!entry) {
      return {
        content: [{ type: 'text', text: 'Error: entry is required for append action' }],
        isError: true,
      };
    }
    const target = partition || categorizeMemoryEntry(entry);
    appendMemory(entry, target);
    return { content: [{ type: 'text', text: `Memory entry appended to ${target}.` }] };
  },
);

server.tool(
  'price_feed',
  'Get real-time cryptocurrency prices from CoinGecko.',
  {
    symbol: z.string().describe('Asset ID, e.g. "bitcoin", "ethereum", "solana"'),
    currency: z.string().optional().describe('Target currency (default "usd")'),
  },
  async ({ symbol, currency }) => {
    const result = await executor.execute('price_feed', {
      asset: symbol,
      currency,
    });
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'shell',
  'Execute a shell command and return stdout/stderr.',
  {
    command: z.string().describe('Shell command to execute'),
    cwd: z.string().optional().describe('Working directory'),
  },
  async ({ command, cwd }) => {
    const result = await executor.execute('shell', { command, cwd });
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'filesystem',
  'Read, write, list, or delete files on the local filesystem.',
  {
    action: z.enum(['read', 'write', 'list', 'delete']).describe('File operation'),
    path: z.string().describe('File or directory path'),
    content: z.string().optional().describe('Content for write action'),
  },
  async ({ action, path, content }) => {
    const result = await executor.execute('filesystem', { action, path, content });
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'http',
  'Make HTTP requests (GET, POST, PUT, DELETE) to any API.',
  {
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).describe('HTTP method'),
    url: z.string().describe('Request URL'),
    headers: z.string().optional().describe('Request headers as JSON string, e.g. {"Authorization":"Bearer ..."}'),
    body: z.string().optional().describe('Request body (for POST/PUT)'),
  },
  async ({ method, url, headers, body }) => {
    let parsedHeaders: Record<string, string> | undefined;
    if (headers) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch {
        return { content: [{ type: 'text', text: 'Error: headers must be a valid JSON string' }], isError: true };
      }
    }
    const result = await executor.execute('http', { method, url, headers: parsedHeaders, body });
    return { content: [{ type: 'text', text: result }] };
  },
);

server.tool(
  'browser_use',
  'Control a web browser — navigate pages, click elements, fill forms, take screenshots.',
  {
    action: z
      .enum(['open', 'state', 'click', 'type', 'input', 'screenshot', 'eval', 'scroll', 'close'])
      .describe('Browser action to perform'),
    url: z.string().optional().describe('URL for open action'),
    index: z.number().optional().describe('Element index for click/input actions'),
    text: z.string().optional().describe('Text for type/input actions'),
    path: z.string().optional().describe('Screenshot save path'),
    code: z.string().optional().describe('JS code for eval action'),
    direction: z.enum(['up', 'down']).optional().describe('Scroll direction'),
  },
  async ({ action, url, index, text, path, code, direction }) => {
    const result = await executor.execute('browser_use', {
      action,
      url,
      index,
      text,
      path,
      code,
      direction,
    });
    return { content: [{ type: 'text', text: result }] };
  },
);

// ────── Resources ──────

server.resource('company-memory', 'company://memory', async () => {
  const chairman = loadChairman();
  let text = '';
  if (chairman.trim()) text += `--- Chairman ---\n${chairman}\n\n`;
  for (const p of MEMORY_PARTITIONS) {
    const c = loadPartition(p);
    if (c.trim()) text += `--- ${p} ---\n${c}\n\n`;
  }
  return {
    contents: [
      {
        uri: 'company://memory',
        text: text || '(empty — no memory entries yet)',
        mimeType: 'text/markdown',
      },
    ],
  };
});

// ────── Start ──────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ClawCompany MCP Server running (stdio)');
  console.error('Tools: web_search, web_fetch, company_memory, price_feed, shell, filesystem, http, browser_use');
  console.error('');
  console.error('Add to Claude Code:');
  console.error('  claude mcp add clawcompany -- npx tsx server/src/mcp-server.ts');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
