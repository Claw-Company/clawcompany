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
}
