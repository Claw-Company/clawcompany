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
}
