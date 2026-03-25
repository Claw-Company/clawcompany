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
const memoryPath = `${process.env.HOME}/.clawcompany/memory.md`;

function loadMemory(): string {
  try {
    if (existsSync(memoryPath)) return readFileSync(memoryPath, 'utf-8');
  } catch {}
  return '';
}

function appendMemory(entry: string): void {
  const dir = `${process.env.HOME}/.clawcompany`;
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const existing = loadMemory();
    const newContent =
      existing +
      '\n\n---\n\n' +
      `[${new Date().toISOString().slice(0, 10)}] ${entry}`;
    writeFileSync(memoryPath, newContent);
  } catch {}
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
  'Read or append to ClawCompany shared memory (~/.clawcompany/memory.md)',
  {
    action: z.enum(['read', 'append']).describe('Read all memory or append a new entry'),
    entry: z.string().optional().describe('New memory entry to append (required for append)'),
  },
  async ({ action, entry }) => {
    if (action === 'read') {
      const memory = loadMemory();
      return {
        content: [{ type: 'text', text: memory || '(empty — no memory entries yet)' }],
      };
    }
    // append
    if (!entry) {
      return {
        content: [{ type: 'text', text: 'Error: entry is required for append action' }],
        isError: true,
      };
    }
    appendMemory(entry);
    return { content: [{ type: 'text', text: `Memory entry appended successfully.` }] };
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
  const memory = loadMemory();
  return {
    contents: [
      {
        uri: 'company://memory',
        text: memory || '(empty — no memory entries yet)',
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
