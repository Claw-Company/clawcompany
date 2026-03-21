// ============================================================
// Code Manager — Multi-tab terminal management for AI tools
//
// Manages multiple child processes (Claude Code, Codex, Cursor, etc.)
// with SSE output streaming, persistence, and channel notifications.
// ============================================================

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ──── Types ────

export interface CodeSession {
  id: string;
  name: string;
  path: string;
  tool: 'claude' | 'codex' | 'cursor' | 'custom';
  command: string;
  args: string[];
  status: 'running' | 'stopped' | 'error';
  pid?: number;
  autoStart: boolean;
  notify: boolean;
  color: string;
  createdAt: string;
  lastStarted?: string;
  exitCode?: number;
}

export interface CodeSessionInput {
  name: string;
  path: string;
  tool: 'claude' | 'codex' | 'cursor' | 'custom';
  command?: string;
  args?: string[];
  autoStart?: boolean;
  notify?: boolean;
  color?: string;
}

// ──── Tool Presets ────

const TOOL_PRESETS: Record<string, { command: string; defaultArgs: string[]; label: string; hint: string }> = {
  claude:  { command: 'claude',  defaultArgs: ['--print'],  label: 'Claude Code',  hint: 'Add your prompt in Args, e.g.: refactor the auth module' },
  codex:   { command: 'codex',   defaultArgs: [],            label: 'OpenAI Codex', hint: 'Add task in Args' },
  cursor:  { command: 'cursor',  defaultArgs: ['--cli'],     label: 'Cursor',       hint: '' },
  custom:  { command: '',        defaultArgs: [],            label: 'Custom',       hint: 'Any shell command: npm run dev, python app.py, etc.' },
};

const COLORS = ['#d85a30', '#1d9e75', '#378add', '#d4537e', '#ba7517', '#7f77dd', '#639922', '#e24b4a'];

// ──── CodeManager ────

export class CodeManager extends EventEmitter {
  private sessions: CodeSession[] = [];
  private processes = new Map<string, ChildProcess>();
  private outputBuffers = new Map<string, string[]>();
  private configPath: string;

  constructor() {
    super();
    const homeDir = process.env.HOME ?? '~';
    const configDir = join(homeDir, '.clawcompany');
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    this.configPath = join(configDir, 'code-sessions.json');
    this.load();
  }

  // ──── CRUD ────

  list(): CodeSession[] {
    return this.sessions.map(s => ({
      ...s,
      status: this.processes.has(s.id) ? 'running' : s.status === 'running' ? 'stopped' : s.status,
    }));
  }

  get(id: string): CodeSession | undefined {
    return this.sessions.find(s => s.id === id);
  }

  add(input: CodeSessionInput): CodeSession {
    const preset = TOOL_PRESETS[input.tool] ?? TOOL_PRESETS.custom;
    const id = `code_${Date.now().toString(36)}`;

    const session: CodeSession = {
      id,
      name: input.name,
      path: input.path,
      tool: input.tool,
      command: input.command || preset.command,
      args: [...preset.defaultArgs, ...(input.args ?? [])],
      status: 'stopped',
      autoStart: input.autoStart ?? false,
      notify: input.notify ?? true,
      color: input.color ?? COLORS[this.sessions.length % COLORS.length],
      createdAt: new Date().toISOString(),
    };

    this.sessions.push(session);
    this.outputBuffers.set(id, []);
    this.save();
    return session;
  }

  update(id: string, updates: Partial<CodeSessionInput>): CodeSession | null {
    const session = this.sessions.find(s => s.id === id);
    if (!session) return null;

    if (updates.name !== undefined) session.name = updates.name;
    if (updates.path !== undefined) session.path = updates.path;
    if (updates.tool !== undefined) session.tool = updates.tool;
    if (updates.command !== undefined) session.command = updates.command;
    if (updates.args !== undefined) session.args = updates.args;
    if (updates.autoStart !== undefined) session.autoStart = updates.autoStart;
    if (updates.notify !== undefined) session.notify = updates.notify;
    if (updates.color !== undefined) session.color = updates.color;

    this.save();
    return session;
  }

  remove(id: string): boolean {
    if (this.processes.has(id)) this.stop(id);
    const idx = this.sessions.findIndex(s => s.id === id);
    if (idx === -1) return false;
    this.sessions.splice(idx, 1);
    this.outputBuffers.delete(id);
    this.save();
    return true;
  }

  // ──── Process Management ────

  start(id: string): void {
    const session = this.sessions.find(s => s.id === id);
    if (!session) throw new Error('Session not found');
    if (this.processes.has(id)) throw new Error('Already running');
    if (!session.command) throw new Error('No command configured');

    const expandedPath = session.path.replace(/^~/, process.env.HOME ?? '');

    if (!existsSync(expandedPath)) {
      throw new Error(`Path does not exist: ${expandedPath}`);
    }

    // Build full command string with properly quoted args
    const quotedArgs = session.args.map(a => a.includes(' ') ? `"${a.replace(/"/g, '\\"')}"` : a);
    const fullCmd = [session.command, ...quotedArgs].join(' ');

    const child = spawn(fullCmd, [], {
      cwd: expandedPath,
      env: { ...process.env, FORCE_COLOR: '0' },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.processes.set(id, child);
    session.status = 'running';
    session.pid = child.pid;
    session.lastStarted = new Date().toISOString();
    session.exitCode = undefined;

    // Init output buffer
    if (!this.outputBuffers.has(id)) this.outputBuffers.set(id, []);
    const buffer = this.outputBuffers.get(id)!;

    const addLine = (line: string, stream: 'stdout' | 'stderr') => {
      const ts = new Date().toTimeString().slice(0, 8);
      const entry = JSON.stringify({ ts, text: line, stream });
      buffer.push(entry);
      if (buffer.length > 500) buffer.shift();
      this.emit('output', { sessionId: id, line: entry });
    };

    const onData = (stream: 'stdout' | 'stderr') => (data: Buffer) => {
      const text = data.toString();
      // Strip ANSI codes for v1
      const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      const lines = clean.split('\n');
      for (const line of lines) {
        if (line.trim()) addLine(line, stream);
      }
    };

    child.stdout?.on('data', onData('stdout'));
    child.stderr?.on('data', onData('stderr'));

    child.on('error', (err) => {
      addLine(`Process error: ${err.message}`, 'stderr');
      session.status = 'error';
      this.processes.delete(id);
      this.save();
      this.emit('exit', { sessionId: id, code: -1, name: session.name, error: err.message });
    });

    child.on('exit', (code) => {
      this.processes.delete(id);
      session.status = code === 0 ? 'stopped' : 'error';
      session.exitCode = code ?? -1;
      session.pid = undefined;
      this.save();

      const startTime = session.lastStarted ? new Date(session.lastStarted).getTime() : Date.now();
      const runtime = Math.round((Date.now() - startTime) / 1000);
      const runtimeStr = runtime > 60 ? `${Math.floor(runtime / 60)}m ${runtime % 60}s` : `${runtime}s`;

      this.emit('exit', { sessionId: id, code, name: session.name, runtime: runtimeStr });

      // Notify via channels
      if (session.notify) {
        const emoji = code === 0 ? '✅' : '❌';
        const msg = `${emoji} [Code] "${session.name}" ${code === 0 ? 'completed' : `exited (code ${code})`}\n📁 ${session.path}\n⏱ Runtime: ${runtimeStr}`;
        this.emit('notify', { sessionId: id, message: msg });
      }
    });

    this.save();
    console.log(`  [Code] Started "${session.name}" (${session.command} ${session.args.join(' ')}) in ${expandedPath}`);
  }

  stop(id: string): void {
    const child = this.processes.get(id);
    if (!child) return;

    console.log(`  [Code] Stopping "${this.get(id)?.name}"...`);
    child.kill('SIGTERM');

    // Force kill after 5s
    const timer = setTimeout(() => {
      if (this.processes.has(id)) {
        child.kill('SIGKILL');
        this.processes.delete(id);
        const session = this.sessions.find(s => s.id === id);
        if (session) {
          session.status = 'stopped';
          session.pid = undefined;
          this.save();
        }
      }
    }, 5000);

    child.once('exit', () => clearTimeout(timer));
  }

  restart(id: string): void {
    if (this.processes.has(id)) {
      const child = this.processes.get(id)!;
      child.once('exit', () => {
        setTimeout(() => this.start(id), 500);
      });
      this.stop(id);
    } else {
      this.start(id);
    }
  }

  startAll(): string[] {
    const started: string[] = [];
    for (const session of this.sessions) {
      if (!this.processes.has(session.id)) {
        try {
          this.start(session.id);
          started.push(session.id);
        } catch (err: any) {
          console.error(`  [Code] Failed to start "${session.name}": ${err.message}`);
        }
      }
    }
    return started;
  }

  stopAll(): void {
    for (const id of this.processes.keys()) {
      this.stop(id);
    }
  }

  // ──── Output ────

  getOutput(id: string): string[] {
    return this.outputBuffers.get(id) ?? [];
  }

  clearOutput(id: string): void {
    this.outputBuffers.set(id, []);
  }

  // ──── Status ────

  getStatus(): { total: number; running: number; stopped: number; error: number } {
    const sessions = this.list();
    return {
      total: sessions.length,
      running: sessions.filter(s => s.status === 'running').length,
      stopped: sessions.filter(s => s.status === 'stopped').length,
      error: sessions.filter(s => s.status === 'error').length,
    };
  }

  // ──── Presets ────

  static getPresets() {
    return Object.entries(TOOL_PRESETS).map(([id, p]) => ({ id, ...p }));
  }

  // ──── Persistence ────

  private save(): void {
    try {
      const data = this.sessions.map(s => ({
        id: s.id, name: s.name, path: s.path, tool: s.tool,
        command: s.command, args: s.args, autoStart: s.autoStart,
        notify: s.notify, color: s.color, createdAt: s.createdAt,
      }));
      writeFileSync(this.configPath, JSON.stringify(data, null, 2));
    } catch {}
  }

  private load(): void {
    try {
      if (existsSync(this.configPath)) {
        const data = JSON.parse(readFileSync(this.configPath, 'utf-8'));
        this.sessions = data.map((d: any) => ({
          ...d,
          status: 'stopped' as const,
          pid: undefined,
          exitCode: undefined,
        }));
        for (const s of this.sessions) {
          this.outputBuffers.set(s.id, []);
        }
        if (this.sessions.length > 0) {
          console.log(`  💻 Code Manager: ${this.sessions.length} sessions loaded`);
        }
      }
    } catch {}
  }
}
