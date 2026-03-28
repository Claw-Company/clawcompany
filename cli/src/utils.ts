import { resolve, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

// ──────────────────────────────────────────
// Banner
// ──────────────────────────────────────────

export function banner() {
  console.log('');
  console.log('  🦞 ClawCompany v0.33.0');
  console.log('  Build for OPC. Every human being is a chairman.');
  console.log('');
}

// ──────────────────────────────────────────
// Config directory: ~/.clawcompany/
// ──────────────────────────────────────────

export function getConfigDir(): string {
  const dir = join(process.env.HOME ?? '~', '.clawcompany');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export function configExists(): boolean {
  return existsSync(getConfigPath());
}

export interface ClawConfig {
  apiKey: string;
  companyName: string;
  template: string;
  serverPort: number;
  createdAt: string;
  roles?: Record<string, any>; // Template role overrides
}

export function readConfig(): ClawConfig | null {
  if (!configExists()) return null;
  try {
    return JSON.parse(readFileSync(getConfigPath(), 'utf-8'));
  } catch {
    return null;
  }
}

export function writeConfig(config: ClawConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

// ──────────────────────────────────────────
// Memory file: ~/.clawcompany/memory.json
// ──────────────────────────────────────────

import { createEmptyMemory, type ClawMemory } from '@clawcompany/shared';

export function getMemoryPath(): string {
  return join(getConfigDir(), 'memory.json');
}

export function readMemory(): ClawMemory {
  try {
    if (existsSync(getMemoryPath())) {
      return JSON.parse(readFileSync(getMemoryPath(), 'utf-8'));
    }
  } catch {}
  return createEmptyMemory();
}

export function writeMemory(memory: ClawMemory): void {
  writeFileSync(getMemoryPath(), JSON.stringify(memory, null, 2));
}

// ──────────────────────────────────────────
// API client (talks to local server)
// ──────────────────────────────────────────

export async function apiGet(path: string, port = 3200): Promise<any> {
  const res = await fetch(`http://localhost:${port}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function apiPost(path: string, body: any, port = 3200): Promise<any> {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `API error: ${res.status}`);
  }
  return res.json();
}

// ──────────────────────────────────────────
// ClawAPI direct validation
// ──────────────────────────────────────────

export async function validateClawApiKey(key: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const res = await fetch('https://clawapi.org/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-oss-20b',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      }),
    });

    if (res.status === 401) return { valid: false, error: 'Invalid key. Check your key at clawapi.org' };
    if (!res.ok) return { valid: false, error: `ClawAPI returned ${res.status}. Try again later.` };

    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: `Cannot reach ClawAPI: ${err.message}. Check your internet connection.` };
  }
}

// ──────────────────────────────────────────
// Server management
// ──────────────────────────────────────────

export async function isServerRunning(port = 3200): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
