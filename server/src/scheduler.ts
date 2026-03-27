// ============================================================
// CronScheduler — automated routines for your AI company
//
// Zero dependencies. Checks every 60s against cron patterns.
// Supports: "0 9 * * *" (daily 9am), "*/5 * * * *" (every 5min),
//           "0 9 * * 1" (Monday 9am), "0 */2 * * *" (every 2h)
//
// Chairman sets routines → company runs itself.
// ============================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { DirectRunner } from './channels/index.js';

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

export interface Routine {
  id: string;
  name: string;
  /** Cron expression: "min hour dom month dow" */
  cron: string;
  /** What to do: run a mission or chat with a role */
  type: 'mission' | 'chat';
  /** Mission goal or chat message */
  content: string;
  /** Role to chat with (only for type=chat) */
  role?: string;
  /** Where to deliver results */
  channel: 'telegram' | 'discord' | 'dashboard' | 'all';
  /** Platform-specific chat ID for delivery */
  chatId?: string;
  /** Is this routine active? */
  enabled: boolean;
  /** When was it last run? (ISO string) */
  lastRun?: string;
  /** Created at */
  createdAt: string;
}

export type ResultSender = (channel: string, chatId: string | undefined, text: string) => Promise<void>;

// ──────────────────────────────────────────
// Cron parser (zero-dependency)
// ──────────────────────────────────────────

function matchCronField(field: string, value: number, max: number): boolean {
  if (field === '*') return true;

  // */N — every N
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2));
    return step > 0 && value % step === 0;
  }

  // Comma-separated: 1,3,5
  if (field.includes(',')) {
    return field.split(',').some(f => matchCronField(f.trim(), value, max));
  }

  // Range: 1-5
  if (field.includes('-')) {
    const [lo, hi] = field.split('-').map(Number);
    return value >= lo && value <= hi;
  }

  // Exact match
  return parseInt(field) === value;
}

function cronMatches(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [min, hour, dom, month, dow] = parts;

  return (
    matchCronField(min, now.getMinutes(), 59) &&
    matchCronField(hour, now.getHours(), 23) &&
    matchCronField(dom, now.getDate(), 31) &&
    matchCronField(month, now.getMonth() + 1, 12) &&
    matchCronField(dow, now.getDay(), 6)
  );
}

// Human-readable description of cron
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;

  const [min, hour, dom, month, dow] = parts;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`;
  if (hour.startsWith('*/')) return `Every ${hour.slice(2)} hours at :${min.padStart(2, '0')}`;
  if (dow !== '*') {
    const dayName = days[parseInt(dow)] ?? dow;
    return `${dayName} at ${hour}:${min.padStart(2, '0')}`;
  }
  if (dom !== '*') return `Day ${dom} at ${hour}:${min.padStart(2, '0')}`;
  if (hour !== '*' && min !== '*') return `Daily at ${hour}:${min.padStart(2, '0')}`;
  return cron;
}

// ──────────────────────────────────────────
// CronScheduler
// ──────────────────────────────────────────

export interface RoutineLogEntry {
  name: string;
  routineId: string;
  timestamp: string;
  ok: boolean;
  cost?: number;
  time?: number;
  summary?: string;
  fullResult?: string;
  error?: string;
}

export class CronScheduler {
  private routines: Routine[] = [];
  private executionLog: RoutineLogEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private runner: DirectRunner;
  private sendResult: ResultSender;
  private configPath: string;
  private logPath: string;
  private running: Set<string> = new Set(); // prevent double-runs
  private getLeaderId: () => string;

  constructor(runner: DirectRunner, sendResult: ResultSender, getLeaderId?: () => string) {
    this.runner = runner;
    this.sendResult = sendResult;
    this.getLeaderId = getLeaderId ?? (() => 'ceo');
    const dir = join(homedir(), '.clawcompany');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.configPath = join(dir, 'routines.json');
    this.logPath = join(dir, 'routine-log.json');
    this.load();
    this.loadLog();
  }

  // ── Persistence ──

  private load(): void {
    try {
      if (existsSync(this.configPath)) {
        this.routines = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      }
    } catch {
      this.routines = [];
    }
  }

  private save(): void {
    writeFileSync(this.configPath, JSON.stringify(this.routines, null, 2));
  }

  private loadLog(): void {
    try {
      if (existsSync(this.logPath)) {
        this.executionLog = JSON.parse(readFileSync(this.logPath, 'utf-8'));
      }
    } catch {
      this.executionLog = [];
    }
  }

  private saveLog(): void {
    // Keep last 50 entries
    if (this.executionLog.length > 50) this.executionLog = this.executionLog.slice(-50);
    writeFileSync(this.logPath, JSON.stringify(this.executionLog, null, 2));
  }

  private addLogEntry(entry: RoutineLogEntry): void {
    this.executionLog.push(entry);
    this.saveLog();
  }

  /** Get execution log (most recent first) */
  getLog(): RoutineLogEntry[] {
    return [...this.executionLog].reverse();
  }

  // ── CRUD ──

  list(): Routine[] {
    return this.routines.map(r => ({ ...r }));
  }

  get(id: string): Routine | undefined {
    return this.routines.find(r => r.id === id);
  }

  add(routine: Omit<Routine, 'id' | 'createdAt'>): Routine {
    const newRoutine: Routine = {
      ...routine,
      id: `routine-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.routines.push(newRoutine);
    this.save();
    return newRoutine;
  }

  update(id: string, patch: Partial<Routine>): Routine | null {
    const idx = this.routines.findIndex(r => r.id === id);
    if (idx === -1) return null;
    this.routines[idx] = { ...this.routines[idx], ...patch, id }; // id is immutable
    this.save();
    return this.routines[idx];
  }

  remove(id: string): boolean {
    const before = this.routines.length;
    this.routines = this.routines.filter(r => r.id !== id);
    if (this.routines.length < before) {
      this.save();
      return true;
    }
    return false;
  }

  // ── Scheduler engine ──

  start(): void {
    if (this.timer) return;

    const enabled = this.routines.filter(r => r.enabled).length;
    if (enabled > 0) {
      console.log(`  📅 Scheduler started — ${enabled} routine${enabled > 1 ? 's' : ''} active`);
      this.routines.filter(r => r.enabled).forEach(r => {
        console.log(`     └─ ${r.name}: ${describeCron(r.cron)} → ${r.type === 'mission' ? '🎯' : '💬'} ${r.content.slice(0, 50)}...`);
      });
    } else {
      console.log('  📅 Scheduler started — no routines configured');
    }

    // Check every 60 seconds
    this.timer = setInterval(() => this.tick(), 60_000);

    // Also check immediately (in case server restarts at exact cron time)
    setTimeout(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Get IDs of currently running routines */
  getRunning(): string[] {
    return [...this.running];
  }

  /** Check if a specific routine is running */
  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  /** Stop a running routine (disables it, current execution finishes but won't re-trigger) */
  stopRoutine(id: string): boolean {
    const routine = this.routines.find(r => r.id === id);
    if (!routine) return false;
    routine.enabled = false;
    this.save();
    return true;
  }

  /** Run a specific routine manually (for testing from Dashboard) */
  async runNow(id: string): Promise<string> {
    const routine = this.get(id);
    if (!routine) throw new Error('Routine not found');
    if (this.running.has(id)) throw new Error('Routine is already running');
    this.running.add(id);
    try {
      return await this.executeRoutine(routine);
    } finally {
      this.running.delete(id);
    }
  }

  private async tick(): Promise<void> {
    const now = new Date();

    for (const routine of this.routines) {
      if (!routine.enabled) continue;
      if (this.running.has(routine.id)) continue; // already running

      if (!cronMatches(routine.cron, now)) continue;

      // Prevent re-triggering within the same minute
      if (routine.lastRun) {
        const lastRun = new Date(routine.lastRun);
        const diffMs = now.getTime() - lastRun.getTime();
        if (diffMs < 60_000) continue;
      }

      // Execute in background
      this.running.add(routine.id);
      this.executeRoutine(routine)
        .then(result => {
          console.log(`  📅 Routine "${routine.name}" completed`);
        })
        .catch(err => {
          console.error(`  ❌ Routine "${routine.name}" failed: ${err.message}`);
        })
        .finally(() => {
          this.running.delete(routine.id);
        });
    }
  }

  private async executeRoutine(routine: Routine): Promise<string> {
    console.log(`\n  📅 Running routine: "${routine.name}" (${describeCron(routine.cron)})`);
    const startTime = Date.now();

    // Update lastRun
    const idx = this.routines.findIndex(r => r.id === routine.id);
    if (idx !== -1) {
      this.routines[idx].lastRun = new Date().toISOString();
      this.save();
    }

    try {
      let resultText: string;
      let cost = 0;
      let summary = '';

      if (routine.type === 'mission') {
        const report = await this.runner.runMission(routine.content);
        cost = report.totalCost;
        const header = `📅 **Scheduled Report: ${routine.name}**\n${describeCron(routine.cron)}\n\n`;
        const summaryLine = `**Cost:** $${report.totalCost.toFixed(4)} · **Time:** ${report.totalTimeSeconds.toFixed(0)}s · **Streams:** ${report.workStreams.length}\n\n`;
        const details = report.workStreams
          .map(ws => `### ${ws.title}\n**${ws.assignedTo}** — ${ws.status}\n\n${ws.output}`)
          .join('\n\n---\n\n');
        resultText = header + summaryLine + details;
        summary = report.workStreams.map(ws => ws.title).join(', ');
      } else {
        const role = routine.role ?? this.getLeaderId();
        const chat = await this.runner.runChat(role, routine.content);
        cost = chat.cost;
        resultText = `📅 **${routine.name}** (${role})\n\n${chat.content}`;
        summary = chat.content.slice(0, 150);
      }

      // Log success
      this.addLogEntry({
        name: routine.name,
        routineId: routine.id,
        timestamp: new Date().toISOString(),
        ok: true,
        cost,
        time: (Date.now() - startTime) / 1000,
        summary,
        fullResult: resultText,
      });

      // Deliver to channel(s)
      await this.sendResult(routine.channel, routine.chatId, resultText);

      return resultText;
    } catch (err: any) {
      // Log failure
      this.addLogEntry({
        name: routine.name,
        routineId: routine.id,
        timestamp: new Date().toISOString(),
        ok: false,
        time: (Date.now() - startTime) / 1000,
        error: err.message,
      });
      throw err;
    }
  }
}

// ──────────────────────────────────────────
// Built-in routine templates
// ──────────────────────────────────────────

export const ROUTINE_TEMPLATES: Array<Omit<Routine, 'id' | 'createdAt' | 'lastRun' | 'chatId'>> = [
  {
    name: 'Daily market brief',
    cron: '0 9 * * *',
    type: 'mission',
    content: 'Analyze today\'s crypto and stock market trends. Cover BTC, ETH, TSLA, NVDA. Include key price levels and recent news.',
    channel: 'telegram',
    enabled: false,
  },
  {
    name: 'Weekly cost report',
    cron: '0 10 * * 1',
    type: 'mission',
    content: 'Generate a weekly cost analysis report. Review all mission costs from the past week, identify most expensive operations, and recommend optimizations.',
    channel: 'telegram',
    enabled: false,
  },
  {
    name: 'Competitor watch',
    cron: '0 8 * * 1,4',
    type: 'mission',
    content: 'Research latest updates from our competitors. Check GitHub releases, social media, and news. Summarize key developments and strategic implications.',
    channel: 'telegram',
    enabled: false,
  },
  {
    name: 'Daily standup summary',
    cron: '30 9 * * 1-5',
    type: 'chat',
    content: 'Give me a brief morning standup: what was accomplished yesterday, what\'s planned for today, and any blockers.',
    channel: 'telegram',
    enabled: false,
  },
  {
    name: 'BTC trend — Polymarket + Price',
    cron: '*/5 * * * *',
    type: 'mission',
    content: 'BTC trend analysis: 1) Fetch current BTC price from CoinGecko. 2) Check Polymarket (polymarket.com) for any active BTC prediction markets — look for markets about BTC price targets, BTC above/below certain levels, or BTC monthly close predictions. Report the current odds/probabilities. 3) Check Fear & Greed Index from alternative.me/crypto/fear-and-greed-index/. 4) Based on all data, give a clear SHORT-TERM verdict: UP or DOWN trend with confidence level (high/medium/low) and key reasons. Keep it concise — max 200 words.',
    channel: 'all',
    enabled: false,
  },
];
