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
};

/**
 * Get ToolDefinition objects for a list of tool names.
 */
export function getToolsForRole(toolNames: string[]): ToolDefinition[] {
  return toolNames
    .map((name) => BUILTIN_TOOLS[name])
    .filter((t): t is ToolDefinition => t !== undefined);
}
