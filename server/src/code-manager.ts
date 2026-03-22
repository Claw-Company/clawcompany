// ============================================================
// Code Manager v2 — Full terminal emulation with node-pty
//
// Each tab = real PTY with ANSI colors, cursor movement,
// and interactive input via WebSocket.
// Falls back to child_process.spawn if node-pty not available.
// ============================================================

import { spawn as cpSpawn } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Try to load node-pty (optional native dependency)
let ptySpawn: any = null;
try {
  const pty = await import('node-pty');
  ptySpawn = pty.spawn;
  console.log('  💻 Code Manager: node-pty loaded (full terminal mode)');
} catch {
  console.log('  💻 Code Manager: node-pty not found (text-only mode)');
  console.log('     └─ Install for full terminal: cd server && pnpm add node-pty');
}

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
  claude:  { command: 'claude',  defaultArgs: [],  label: 'Claude Code',  hint: 'Interactive terminal mode (requires node-pty)' },
  codex:   { command: 'codex',   defaultArgs: [],            label: 'OpenAI Codex', hint: 'Add task in Args' },
  cursor:  { command: 'cursor',  defaultArgs: ['--cli'],     label: 'Cursor',       hint: '' },
  custom:  { command: '',        defaultArgs: [],            label: 'Custom',       hint: 'Any shell command: npm run dev, python app.py, etc.' },
};

const COLORS = ['#d85a30', '#1d9e75', '#378add', '#d4537e', '#ba7517', '#7f77dd', '#639922', '#e24b4a'];

// ──── CodeManager ────

export class CodeManager extends EventEmitter {
  private sessions: CodeSession[] = [];
  private processes = new Map<string, any>();
  private outputBuffers = new Map<string, string[]>();
  private configPath: string;
  private _batchMode = false;

  readonly hasPty: boolean;

  constructor() {
    super();
    this.hasPty = ptySpawn !== null;
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

    const quotedArgs = session.args.map(a => a.includes(' ') ? `"${a.replace(/"/g, '\\"')}"` : a);
    const fullCmd = [session.command, ...quotedArgs].join(' ');

    if (!this.outputBuffers.has(id)) this.outputBuffers.set(id, []);
    const buffer = this.outputBuffers.get(id)!;

    if (this.hasPty) {
      this.startPty(id, session, fullCmd, expandedPath, buffer);
    } else {
      this.startSpawn(id, session, fullCmd, expandedPath, buffer);
    }

    session.status = 'running';
    session.lastStarted = new Date().toISOString();
    session.exitCode = undefined;
    this.save();

    console.log(`  [Code] Started "${session.name}" ${this.hasPty ? '(PTY)' : '(spawn)'} in ${expandedPath}`);

    if (session.notify && !this._batchMode) {
      this.emit('notify', { sessionId: id, message: `🟢 [Code] Started "${session.name}" — ${session.path}` });
    }
  }

  private startPty(id: string, session: CodeSession, fullCmd: string, cwd: string, buffer: string[]): void {
    const shell = process.env.SHELL || '/bin/zsh';
    console.log(`  [Code] PTY spawn: shell=${shell}, args=['-l', '-c', '${fullCmd}'], cwd=${cwd}`);
    const pty = ptySpawn(shell, ['-l', '-c', fullCmd], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    this.processes.set(id, pty);
    session.pid = pty.pid;

    pty.onData((data: string) => {
      buffer.push(data);
      while (buffer.length > 2000) buffer.shift();
      this.emit('output', { sessionId: id, data });
    });

    pty.onExit(({ exitCode }: { exitCode: number }) => {
      this.processes.delete(id);
      session.status = exitCode === 0 ? 'stopped' : 'error';
      session.exitCode = exitCode;
      session.pid = undefined;
      this.save();

      const runtime = this.calcRuntime(session);
      this.emit('exit', { sessionId: id, code: exitCode, name: session.name, runtime });

      if (session.notify) {
        const emoji = exitCode === 0 ? '✅' : '❌';
        let msg = `${emoji} [Code] "${session.name}" ${exitCode === 0 ? 'completed' : `exited (code ${exitCode})`} — Runtime: ${runtime}`;
        if (exitCode !== 0) {
          const lastLine = this.getLastOutputLine(id);
          if (lastLine) msg += `\nLast: ${lastLine}`;
        }
        this.emit('notify', { sessionId: id, message: msg });
      }
    });
  }

  private startSpawn(id: string, session: CodeSession, fullCmd: string, cwd: string, buffer: string[]): void {
    const child = cpSpawn(fullCmd, [], {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0' },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.processes.set(id, child);
    session.pid = child.pid;

    const onData = (data: Buffer) => {
      const text = data.toString();
      const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      for (const line of clean.split('\n')) {
        if (line.trim()) {
          const ts = new Date().toTimeString().slice(0, 8);
          const entry = JSON.stringify({ ts, text: line, stream: 'stdout' });
          buffer.push(entry);
          if (buffer.length > 500) buffer.shift();
          this.emit('output', { sessionId: id, data: entry, legacy: true });
        }
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', () => { session.status = 'error'; this.processes.delete(id); this.save(); });

    child.on('exit', (code: number | null) => {
      this.processes.delete(id);
      session.status = (code ?? 1) === 0 ? 'stopped' : 'error';
      session.exitCode = code ?? -1;
      session.pid = undefined;
      this.save();

      const runtime = this.calcRuntime(session);
      this.emit('exit', { sessionId: id, code, name: session.name, runtime });

      if (session.notify) {
        const emoji = code === 0 ? '✅' : '❌';
        let msg = `${emoji} [Code] "${session.name}" ${code === 0 ? 'completed' : `exited (code ${code})`} — Runtime: ${runtime}`;
        if (code !== 0) {
          const lastLine = this.getLastOutputLine(id);
          if (lastLine) msg += `\nLast: ${lastLine}`;
        }
        this.emit('notify', { sessionId: id, message: msg });
      }
    });
  }

  // ──── Input & Resize (PTY only) ────

  write(id: string, data: string): void {
    const proc = this.processes.get(id);
    if (proc && this.hasPty && proc.write) proc.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const proc = this.processes.get(id);
    if (proc && this.hasPty && proc.resize) {
      try { proc.resize(cols, rows); } catch {}
    }
  }

  stop(id: string): void {
    const proc = this.processes.get(id);
    if (!proc) return;
    console.log(`  [Code] Stopping "${this.get(id)?.name}"...`);

    if (this.hasPty && proc.kill) {
      proc.kill();
    } else if (proc.kill) {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (this.processes.has(id)) {
          proc.kill('SIGKILL');
          this.processes.delete(id);
          const session = this.sessions.find(s => s.id === id);
          if (session) { session.status = 'stopped'; session.pid = undefined; this.save(); }
        }
      }, 5000);
    }
  }

  restart(id: string): void {
    if (this.processes.has(id)) {
      const handler = (data: any) => {
        if (data.sessionId === id) {
          this.off('exit', handler);
          setTimeout(() => this.start(id), 500);
        }
      };
      this.on('exit', handler);
      this.stop(id);
    } else {
      this.start(id);
    }
  }

  startAll(): string[] {
    const started: string[] = [];
    this._batchMode = true;
    for (const session of this.sessions) {
      if (!this.processes.has(session.id)) {
        try { this.start(session.id); started.push(session.id); }
        catch (err: any) { console.error(`  [Code] Failed to start "${session.name}": ${err.message}`); }
      }
    }
    this._batchMode = false;
    if (started.length > 0) {
      const names = started.map(id => this.get(id)?.name).filter(Boolean).join(', ');
      this.emit('notify', { message: `🟢 [Code] Started ${started.length} projects: ${names}` });
    }
    return started;
  }

  stopAll(): void {
    const count = this.processes.size;
    for (const id of this.processes.keys()) this.stop(id);
    if (count > 0) {
      this.emit('notify', { message: `🔴 [Code] Stopped all ${count} projects` });
    }
  }

  // ──── Output ────

  getOutput(id: string): string[] { return this.outputBuffers.get(id) ?? []; }
  clearOutput(id: string): void { this.outputBuffers.set(id, []); }

  getStatus(): { total: number; running: number; stopped: number; error: number } {
    const s = this.list();
    return { total: s.length, running: s.filter(x => x.status === 'running').length, stopped: s.filter(x => x.status === 'stopped').length, error: s.filter(x => x.status === 'error').length };
  }

  static getPresets() { return Object.entries(TOOL_PRESETS).map(([id, p]) => ({ id, ...p })); }

  private getLastOutputLine(id: string): string | null {
    const buf = this.outputBuffers.get(id);
    if (!buf || buf.length === 0) return null;
    // Walk backwards to find last non-empty line
    for (let i = buf.length - 1; i >= 0; i--) {
      // PTY mode: raw ANSI string; spawn mode: JSON entry
      let text = buf[i];
      try { text = JSON.parse(text).text ?? text; } catch {}
      const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
      if (clean) return clean.length > 200 ? clean.slice(0, 200) + '…' : clean;
    }
    return null;
  }

  private calcRuntime(session: CodeSession): string {
    const start = session.lastStarted ? new Date(session.lastStarted).getTime() : Date.now();
    const secs = Math.round((Date.now() - start) / 1000);
    return secs > 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  }

  private save(): void {
    try {
      const data = this.sessions.map(s => ({ id: s.id, name: s.name, path: s.path, tool: s.tool, command: s.command, args: s.args, autoStart: s.autoStart, notify: s.notify, color: s.color, createdAt: s.createdAt }));
      writeFileSync(this.configPath, JSON.stringify(data, null, 2));
    } catch {}
  }

  private load(): void {
    try {
      if (existsSync(this.configPath)) {
        const data = JSON.parse(readFileSync(this.configPath, 'utf-8'));
        this.sessions = data.map((d: any) => ({ ...d, status: 'stopped' as const, pid: undefined, exitCode: undefined }));
        for (const s of this.sessions) this.outputBuffers.set(s.id, []);
        if (this.sessions.length > 0) console.log(`  💻 Code Manager: ${this.sessions.length} sessions loaded`);
      }
    } catch {}
  }
}
