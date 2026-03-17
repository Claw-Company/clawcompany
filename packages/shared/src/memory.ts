// ============================================================
// ClawCompany Memory System
//
// Two layers:
//   1. Chairman memory — user preferences, habits, context
//   2. Company memory — mission history, learnings, domain knowledge
//
// Auto-learns from every mission. Zero user configuration.
// Injected into agent system prompts as ~200-400 token context.
//
// Storage: ~/.clawcompany/memory.json (CLI) or database (SaaS)
// ============================================================

export interface ChairmanMemory {
  /** Preferred language (auto-detected from messages) */
  language?: string;
  /** Preferred output style: 'brief' | 'detailed' | 'balanced' */
  outputStyle?: string;
  /** Industry/domain focus areas */
  domains: string[];
  /** Common mission types the Chairman gives */
  commonMissions: string[];
  /** Timezone / working hours pattern */
  timezone?: string;
  /** Explicit preferences stated by Chairman */
  preferences: string[];
}

export interface CompanyMemory {
  /** Total missions completed */
  missionCount: number;
  /** Key learnings from past missions */
  learnings: string[];
  /** Domain knowledge accumulated */
  domainKnowledge: string[];
  /** CEO decomposition patterns that worked well */
  goodPatterns: string[];
  /** Last 10 mission summaries (rolling window) */
  recentMissions: MissionSummary[];
}

export interface MissionSummary {
  goal: string;
  date: string;
  cost: number;
  duration: number;
  workStreamCount: number;
  rolesUsed: string[];
  success: boolean;
}

export interface ClawMemory {
  version: 1;
  chairman: ChairmanMemory;
  company: CompanyMemory;
  updatedAt: string;
}

/**
 * Create a fresh empty memory.
 */
export function createEmptyMemory(): ClawMemory {
  return {
    version: 1,
    chairman: {
      domains: [],
      commonMissions: [],
      preferences: [],
    },
    company: {
      missionCount: 0,
      learnings: [],
      domainKnowledge: [],
      goodPatterns: [],
      recentMissions: [],
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Build a compact memory context string for injection into system prompts.
 * Target: ~200-400 tokens (vs OpenClaw's 4,000-10,000).
 */
export function buildMemoryContext(memory: ClawMemory): string {
  const parts: string[] = [];

  // Chairman preferences
  const ch = memory.chairman;
  if (ch.language) parts.push(`Chairman language: ${ch.language}`);
  if (ch.outputStyle) parts.push(`Output style: ${ch.outputStyle}`);
  if (ch.domains.length > 0) parts.push(`Focus areas: ${ch.domains.slice(0, 5).join(', ')}`);
  if (ch.preferences.length > 0) parts.push(`Preferences: ${ch.preferences.slice(0, 5).join('; ')}`);

  // Company context
  const co = memory.company;
  if (co.missionCount > 0) parts.push(`Missions completed: ${co.missionCount}`);
  if (co.learnings.length > 0) parts.push(`Key learnings: ${co.learnings.slice(-5).join('; ')}`);
  if (co.domainKnowledge.length > 0) parts.push(`Domain knowledge: ${co.domainKnowledge.slice(-5).join('; ')}`);

  // Recent mission context
  if (co.recentMissions.length > 0) {
    const recent = co.recentMissions.slice(-3).map(m => m.goal).join('; ');
    parts.push(`Recent missions: ${recent}`);
  }

  if (parts.length === 0) return '';

  return `\n\n## Company Memory\n${parts.join('\n')}`;
}

/**
 * Update memory after a completed mission.
 * Extracts insights without requiring an LLM call — pure heuristics.
 */
export function updateMemoryFromMission(
  memory: ClawMemory,
  mission: {
    goal: string;
    cost: number;
    duration: number;
    workStreams: Array<{ title: string; assignedTo: string; status: string; output?: string }>;
  },
  chairmanMessage?: string,
): ClawMemory {
  const updated = structuredClone(memory);
  const now = new Date().toISOString();
  updated.updatedAt = now;

  // ── Chairman memory ──

  // Auto-detect language from mission goal
  if (chairmanMessage || mission.goal) {
    const text = chairmanMessage ?? mission.goal;
    const hasChinese = /[\u4e00-\u9fff]/.test(text);
    const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(text);
    if (hasChinese) updated.chairman.language = 'zh';
    else if (hasJapanese) updated.chairman.language = 'ja';
    else if (!updated.chairman.language) updated.chairman.language = 'en';
  }

  // Extract domain keywords from mission goal
  const domainKeywords = extractDomains(mission.goal);
  for (const d of domainKeywords) {
    if (!updated.chairman.domains.includes(d)) {
      updated.chairman.domains.push(d);
    }
  }
  // Keep top 10 domains
  if (updated.chairman.domains.length > 10) {
    updated.chairman.domains = updated.chairman.domains.slice(-10);
  }

  // Track common mission patterns
  const missionType = classifyMission(mission.goal);
  if (missionType && !updated.chairman.commonMissions.includes(missionType)) {
    updated.chairman.commonMissions.push(missionType);
  }
  if (updated.chairman.commonMissions.length > 8) {
    updated.chairman.commonMissions = updated.chairman.commonMissions.slice(-8);
  }

  // ── Company memory ──

  updated.company.missionCount++;

  // Add mission summary (rolling window of 10)
  const rolesUsed = [...new Set(mission.workStreams.map(ws => ws.assignedTo))];
  updated.company.recentMissions.push({
    goal: mission.goal.slice(0, 100),
    date: now.split('T')[0],
    cost: mission.cost,
    duration: mission.duration,
    workStreamCount: mission.workStreams.length,
    rolesUsed,
    success: mission.workStreams.every(ws => ws.status === 'completed'),
  });
  if (updated.company.recentMissions.length > 10) {
    updated.company.recentMissions = updated.company.recentMissions.slice(-10);
  }

  return updated;
}

// ──── Helpers ────

function extractDomains(text: string): string[] {
  const domains: string[] = [];
  const lower = text.toLowerCase();

  const domainMap: Record<string, string> = {
    bitcoin: 'crypto', btc: 'crypto', ethereum: 'crypto', eth: 'crypto', '比特币': 'crypto', '以太坊': 'crypto', '加密': 'crypto',
    defi: 'crypto', crypto: 'crypto', trading: 'finance', investment: 'finance',
    revenue: 'finance', stock: 'finance', market: 'finance',
    ai: 'ai/ml', 'machine learning': 'ai/ml', llm: 'ai/ml', agent: 'ai/ml', '人工智能': 'ai/ml',
    marketing: 'marketing', seo: 'marketing', content: 'marketing', brand: 'marketing', '营销': 'marketing',
    code: 'engineering', api: 'engineering', software: 'engineering', deploy: 'engineering',
    legal: 'legal', contract: 'legal', compliance: 'legal',
    ecommerce: 'ecommerce', product: 'ecommerce', shopify: 'ecommerce',
  };

  for (const [keyword, domain] of Object.entries(domainMap)) {
    if (lower.includes(keyword) && !domains.includes(domain)) {
      domains.push(domain);
    }
  }
  return domains;
}

function classifyMission(goal: string): string | null {
  const lower = goal.toLowerCase();
  if (lower.includes('analyz') || lower.includes('分析')) return 'analysis';
  if (lower.includes('research') || lower.includes('研究') || lower.includes('调研')) return 'research';
  if (lower.includes('write') || lower.includes('draft') || lower.includes('写')) return 'writing';
  if (lower.includes('compare') || lower.includes('对比') || lower.includes('比较')) return 'comparison';
  if (lower.includes('build') || lower.includes('create') || lower.includes('开发')) return 'building';
  if (lower.includes('plan') || lower.includes('strategy') || lower.includes('策略')) return 'strategy';
  if (lower.includes('price') || lower.includes('cost') || lower.includes('价格')) return 'pricing';
  return null;
}
