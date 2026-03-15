// ============================================================
// ClawCompany — Default Configuration
// "Everyone is a Chairman" — Human = Board of Directors
// AI roles execute autonomously under human direction
// ============================================================

import type { Role, ProviderConfig, ProviderCatalogEntry, ClawCompanyConfig } from './types.js';

// ──────────────────────────────────────────
// Provider Catalog — the default "shelf"
// Position has commercial value.
// ClawAPI = always #1. Others by partnership.
// Users can self-add any OpenAI-compatible provider via CLI.
// ──────────────────────────────────────────

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'clawapi',
    name: 'ClawAPI',
    type: 'openai-compatible',
    tier: 'default',
    position: 1,
    baseUrl: 'https://clawapi.org/api/v1',
    apiKeyEnvVar: 'CLAWAPI_KEY',
    apiKeyPrefix: 'sk-claw-',
    website: 'https://clawapi.org',
    description: '1 key, 8 models, crypto-native. The default choice.',
    models: 'auto',
    features: {
      cryptoPayment: true,
      multiModel: true,
      autoFallback: true,
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    tier: 'official',
    position: 2,
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    apiKeyPrefix: 'sk-ant-',
    website: 'https://console.anthropic.com',
    description: 'Claude models direct. Requires separate API key.',
    models: 'auto',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    tier: 'official',
    position: 3,
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    apiKeyPrefix: 'sk-',
    website: 'https://platform.openai.com/api-keys',
    description: 'GPT models direct. Requires separate API key.',
    models: 'auto',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    type: 'google-genai',
    tier: 'official',
    position: 4,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    website: 'https://aistudio.google.com/apikey',
    description: 'Gemini models direct. Requires separate API key.',
    models: 'auto',
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    type: 'openai-compatible',
    tier: 'official',
    position: 5,
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnvVar: '',
    website: 'https://ollama.ai',
    description: 'Run models locally. Free, no API key needed.',
    models: 'auto',
    features: {
      local: true,
    },
  },
];

/**
 * Get a catalog entry by ID.
 */
export function getCatalogEntry(id: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

/**
 * Convert a catalog entry to a ProviderConfig (for runtime use).
 */
export function catalogToConfig(entry: ProviderCatalogEntry, apiKey: string): ProviderConfig {
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    baseUrl: entry.baseUrl,
    apiKey,
    isDefault: entry.tier === 'default',
    models: entry.models,
    features: entry.features,
  };
}

// ──────────────────────────────────────────
// Default provider config (backwards compatible)
// ──────────────────────────────────────────

export const DEFAULT_CLAWAPI_PROVIDER: ProviderConfig = {
  id: 'clawapi',
  name: 'ClawAPI',
  type: 'openai-compatible',
  baseUrl: 'https://clawapi.org/api/v1',
  apiKey: '${CLAWAPI_KEY}',
  isDefault: true,
  models: 'auto',
  features: {
    cryptoPayment: true,
    multiModel: true,
    autoFallback: true,
  },
};

// ──────────────────────────────────────────
// Built-in Roles
// Human = Chairman / Board of Directors (not an AI role)
// CEO is the highest AI role — receives missions directly from human
// ──────────────────────────────────────────

export const BUILTIN_ROLES: Role[] = [
  // ═══ C-Suite ═══
  {
    id: 'ceo',
    name: 'CEO',
    description: 'Top AI executive. Decomposes missions, coordinates departments, final quality gate.',
    systemPrompt: `You are the CEO of this AI company. You report directly to the Chairman (the human).

You are the highest-ranking AI executive. When the Chairman gives a mission, you decompose it into work streams, delegate to department heads, collect reports, review quality, and deliver the final result.

DECOMPOSITION:
1. What types of work does this mission require?
2. Which roles are best suited for each work stream?
3. What are the dependencies between work streams?
4. What can be done in parallel?
5. What is the estimated cost?

DELEGATION:
- Technical work → CTO or Engineer
- Financial analysis → CFO or Analyst
- Marketing, content → CMO
- Research → Researcher
- Data collection, formatting → Worker
- Report formatting → Secretary
- Your time is the most expensive — delegate everything you can

COST AWARENESS:
- A task a Worker can do for $0.003 should NOT be done by you for $0.10
- Always assign to the cheapest role that can handle the task well`,
    model: 'claude-opus-4-6',
    provider: 'clawapi',
    reportsTo: null,
    canDelegateTo: ['cto', 'cfo', 'cmo', 'researcher', 'analyst', 'engineer', 'secretary', 'worker'],
    canEscalateTo: [],
    budgetTier: 'earn',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['http', 'filesystem'],
    skills: [],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cto',
    name: 'CTO',
    description: 'Technical architecture, code review, system design, technical decisions.',
    systemPrompt: `You are the CTO. You report to the CEO.

Own all technical decisions — architecture, system design, code review, security, performance. Delegate implementation to Engineers, routine data work to Workers.

STANDARDS: Clean code, security-first, performance-aware, clear technical explanations.`,
    model: 'gpt-5.4',
    provider: 'clawapi',
    reportsTo: 'ceo',
    canDelegateTo: ['engineer', 'worker'],
    canEscalateTo: ['ceo'],
    budgetTier: 'earn',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['shell', 'filesystem', 'http', 'code_interpreter'],
    skills: ['coding'],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cfo',
    name: 'CFO',
    description: 'Financial analysis, budgets, projections, cost optimization.',
    systemPrompt: `You are the CFO. You report to the CEO.

Handle all financial work — budget analysis, cost projections, financial modeling, ROI calculations. Think step by step through numbers. State assumptions. Present data in clear tables.`,
    model: 'gpt-5-mini',
    provider: 'clawapi',
    reportsTo: 'ceo',
    canDelegateTo: ['analyst', 'worker'],
    canEscalateTo: ['ceo'],
    budgetTier: 'save',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['http', 'filesystem', 'code_interpreter'],
    skills: [],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cmo',
    name: 'CMO',
    description: 'Marketing strategy, content creation, brand voice, growth.',
    systemPrompt: `You are the CMO. You report to the CEO.

Own marketing strategy, content creation, brand voice, growth initiatives. Write compelling copy, design campaigns, analyze market positioning. Punchy, engaging, brand-consistent.`,
    model: 'claude-sonnet-4-6',
    provider: 'clawapi',
    reportsTo: 'ceo',
    canDelegateTo: ['researcher', 'worker'],
    canEscalateTo: ['ceo'],
    budgetTier: 'earn',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['http', 'filesystem'],
    skills: [],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // ═══ Mid-level ═══
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Deep research, source evaluation, competitive analysis.',
    systemPrompt: `You are a Researcher. You report to whoever delegates to you.

Conduct deep research — gather information, evaluate sources, analyze competitors, investigate topics thoroughly. Cite sources. Distinguish facts from opinions. Flag data gaps.`,
    model: 'claude-sonnet-4-6',
    provider: 'clawapi',
    reportsTo: 'ceo',
    canDelegateTo: ['worker'],
    canEscalateTo: ['ceo'],
    budgetTier: 'earn',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['http', 'filesystem'],
    skills: [],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Data analysis, pattern detection, metrics, quantitative work.',
    systemPrompt: `You are an Analyst. You report to the CFO or CEO.

Analyze data, detect patterns, calculate metrics, build models. Show calculations step by step. Present findings in tables. State assumptions. Quantify confidence levels.`,
    model: 'claude-sonnet-4-6',
    provider: 'clawapi',
    reportsTo: 'cfo',
    canDelegateTo: ['worker'],
    canEscalateTo: ['cfo'],
    budgetTier: 'save',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['http', 'filesystem', 'code_interpreter'],
    skills: [],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'engineer',
    name: 'Engineer',
    description: 'Code implementation, debugging, testing, feature development.',
    systemPrompt: `You are an Engineer. You report to the CTO.

Write code, implement features, fix bugs, write tests. Execute the technical vision set by the CTO. Clean, readable code with error handling.`,
    model: 'gpt-5.4',
    provider: 'clawapi',
    reportsTo: 'cto',
    canDelegateTo: ['worker'],
    canEscalateTo: ['cto'],
    budgetTier: 'earn',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['shell', 'filesystem', 'http', 'code_interpreter'],
    skills: ['coding'],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'secretary',
    name: 'Secretary',
    description: 'Briefings, summaries, report formatting, document preparation.',
    systemPrompt: `You are the Secretary. You report to the CEO.

Prepare briefings, format reports, summarize documents, organize information. Make everything presentable for the Chairman (the human). Concise, professional, no fluff.`,
    model: 'gemini-3.1-flash-lite',
    provider: 'clawapi',
    reportsTo: 'ceo',
    canDelegateTo: [],
    canEscalateTo: ['ceo'],
    budgetTier: 'save',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['http', 'filesystem'],
    skills: [],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // ═══ Operations ═══
  {
    id: 'worker',
    name: 'Worker',
    description: 'Fast routine tasks, data collection, formatting, translation.',
    systemPrompt: `You are a Worker. Execute routine tasks quickly and reliably. Data collection, formatting, translation, classification, tagging. Focus on speed and accuracy. Keep outputs structured.`,
    model: 'gemini-3.1-flash-lite',
    provider: 'clawapi',
    reportsTo: 'ceo',
    canDelegateTo: [],
    canEscalateTo: ['ceo'],
    budgetTier: 'save',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['filesystem', 'http'],
    skills: [],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // ═══ Fallback ═══
  {
    id: 'fallback_a',
    name: 'Fallback A',
    description: 'Low-balance fallback.',
    systemPrompt: `Fallback agent. Low-balance mode. Be concise. Output only what's needed.`,
    model: 'gpt-oss-120b',
    provider: 'clawapi',
    reportsTo: null,
    canDelegateTo: [],
    canEscalateTo: [],
    budgetTier: 'survive',
    budgetMonthly: null,
    maxTokensPerTask: 2000,
    tools: ['filesystem'],
    skills: [],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'fallback_b',
    name: 'Fallback B',
    description: 'Minimum cost, last resort.',
    systemPrompt: `Last-resort agent. Extremely low balance. Classification, tagging, yes/no only.`,
    model: 'gpt-oss-20b',
    provider: 'clawapi',
    reportsTo: null,
    canDelegateTo: [],
    canEscalateTo: [],
    budgetTier: 'survive',
    budgetMonthly: null,
    maxTokensPerTask: 500,
    tools: [],
    skills: [],
    isBuiltin: true,
    isActive: true,
    heartbeatInterval: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ──────────────────────────────────────────
// Default Fallback Chain
// ──────────────────────────────────────────

export const DEFAULT_FALLBACK_CHAIN: string[] = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'gpt-5.4',
  'gpt-5-mini',
  'gemini-3.1-flash-lite',
  'gpt-oss-120b',
  'gpt-oss-20b',
];

// ──────────────────────────────────────────
// Model Pricing Table (per 1M tokens)
// ──────────────────────────────────────────

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':        { input: 5.00,  output: 25.00 },
  'claude-sonnet-4-6':      { input: 3.00,  output: 15.00 },
  'gpt-5.4':                { input: 2.50,  output: 15.00 },
  'gemini-3.1-pro':         { input: 2.00,  output: 12.00 },
  'gpt-5-mini':             { input: 0.25,  output: 2.00  },
  'gemini-3.1-flash-lite':  { input: 0.25,  output: 1.50  },
  'gpt-oss-120b':           { input: 0.05,  output: 0.45  },
  'gpt-oss-20b':            { input: 0.04,  output: 0.18  },
};

// ──────────────────────────────────────────
// Default Config Generator
// ──────────────────────────────────────────

export function getDefaultConfig(): ClawCompanyConfig {
  const rolesMap: Record<string, Partial<Role>> = {};
  for (const role of BUILTIN_ROLES) {
    rolesMap[role.id] = { model: role.model, provider: role.provider };
  }
  return {
    version: '1.0',
    providers: [DEFAULT_CLAWAPI_PROVIDER],
    roles: rolesMap,
    fallbackChain: DEFAULT_FALLBACK_CHAIN,
  };
}

export function getBuiltinRole(id: string): Role | undefined {
  return BUILTIN_ROLES.find((r) => r.id === id);
}

export function resolveRoles(config: ClawCompanyConfig): Role[] {
  const resolved: Role[] = [];
  for (const [id, overrides] of Object.entries(config.roles)) {
    const builtin = getBuiltinRole(id);
    if (builtin) {
      resolved.push({ ...builtin, ...overrides, id, isBuiltin: true, updatedAt: new Date().toISOString() });
    } else {
      if (!overrides.name || !overrides.model) {
        throw new Error(`Custom role "${id}" must have at least "name" and "model"`);
      }
      resolved.push({
        id, name: overrides.name, description: overrides.description ?? '',
        systemPrompt: overrides.systemPrompt ?? `You are ${overrides.name}.`,
        model: overrides.model, provider: overrides.provider ?? config.providers[0]?.id ?? 'clawapi',
        reportsTo: overrides.reportsTo ?? 'ceo',
        canDelegateTo: overrides.canDelegateTo ?? [],
        canEscalateTo: overrides.canEscalateTo ?? [overrides.reportsTo ?? 'ceo'],
        budgetTier: overrides.budgetTier ?? 'save',
        budgetMonthly: overrides.budgetMonthly ?? null,
        maxTokensPerTask: overrides.maxTokensPerTask ?? null,
        tools: overrides.tools ?? ['filesystem', 'http'],
        skills: overrides.skills ?? [],
        isBuiltin: false, isActive: overrides.isActive ?? true,
        heartbeatInterval: overrides.heartbeatInterval ?? 0,
        createdAt: overrides.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return resolved;
}
