import type { ToolDefinition } from '@clawcompany/shared';

export { ToolExecutor } from './executor.js';

// ──────────────────────────────────────────
// Built-in tool definitions
// ──────────────────────────────────────────

export const BUILTIN_TOOLS: Record<string, ToolDefinition> = {
  filesystem: {
    type: 'function',
    function: {
      name: 'filesystem',
      description: 'Read or write files. Actions: read, write, list, delete.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'write', 'list', 'delete'] },
          path: { type: 'string', description: 'File or directory path' },
          content: { type: 'string', description: 'Content to write (for write action)' },
        },
        required: ['action', 'path'],
      },
    },
  },

  shell: {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Execute a shell command and return stdout/stderr.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory (optional)' },
        },
        required: ['command'],
      },
    },
  },

  http: {
    type: 'function',
    function: {
      name: 'http',
      description: 'Make an HTTP request. Supports GET, POST, PUT, DELETE.',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
          url: { type: 'string', description: 'Request URL' },
          headers: { type: 'object', description: 'Request headers' },
          body: { type: 'string', description: 'Request body (for POST/PUT)' },
        },
        required: ['method', 'url'],
      },
    },
  },

  code_interpreter: {
    type: 'function',
    function: {
      name: 'code_interpreter',
      description: 'Execute JavaScript or Python code in a sandboxed environment.',
      parameters: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: ['javascript', 'python'] },
          code: { type: 'string', description: 'Code to execute' },
        },
        required: ['language', 'code'],
      },
    },
  },

  web_fetch: {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch a web page and extract its text content. Use this to read articles, documentation, blog posts, or any public web page. Returns cleaned text without HTML tags.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL of the web page to fetch' },
          maxLength: { type: 'number', description: 'Max characters to return (default: 8000)' },
        },
        required: ['url'],
      },
    },
  },

  web_search: {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Returns a list of results with titles, URLs, and snippets. Use this to find up-to-date facts, news, prices, or research topics.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Max results to return (default: 5, max: 10)' },
        },
        required: ['query'],
      },
    },
  },

  browser_use: {
    type: 'function',
    function: {
      name: 'browser_use',
      description: 'Control a web browser — navigate pages, click elements, fill forms, take screenshots, run JavaScript. Uses browser-use CLI.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['open', 'state', 'click', 'type', 'input', 'screenshot', 'eval', 'scroll', 'close'],
            description: 'Browser action to perform',
          },
          url: { type: 'string', description: 'URL to open (for open action)' },
          index: { type: 'number', description: 'Element index to interact with (for click/input actions)' },
          text: { type: 'string', description: 'Text to type (for type/input actions)' },
          path: { type: 'string', description: 'Screenshot save path (default: /tmp/screenshot.png)' },
          code: { type: 'string', description: 'JavaScript code to evaluate (for eval action)' },
          direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction (for scroll action)' },
        },
        required: ['action'],
      },
    },
  },

  memory_search: {
    type: 'function',
    function: {
      name: 'memory_search',
      description: 'Search company memory for relevant information. Searches across all memory partitions (chairman, culture, decisions, learnings, tech-stack) using keyword matching.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords (e.g. "TypeScript deploy", "pricing decision")' },
        },
        required: ['query'],
      },
    },
  },

  price_feed: {
    type: 'function',
    function: {
      name: 'price_feed',
      description: 'Get real-time cryptocurrency or asset prices from CoinGecko. Use this INSTEAD of guessing prices from memory. Returns current price, market cap, 24h volume, and 24h change.',
      parameters: {
        type: 'object',
        properties: {
          asset: { type: 'string', description: 'Asset ID, e.g. "bitcoin", "ethereum", "solana", "dogecoin"' },
          currency: { type: 'string', description: 'Target currency (default: "usd"). E.g. "usd", "eur", "cny"' },
        },
        required: ['asset'],
      },
    },
  },
};

/**
 * Get ToolDefinition objects for a list of tool names.
 */
export function getToolsForRole(toolNames: string[]): ToolDefinition[] {
  return toolNames
    .map((name) => BUILTIN_TOOLS[name])
    .filter((t): t is ToolDefinition => t !== undefined);
}
