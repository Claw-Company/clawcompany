// ============================================================
// ClawCompany — Default Configuration
// ClawAPI as default supplier, fully customizable
// ============================================================

import type { Role, ProviderConfig, ClawCompanyConfig } from './types.js';

// ──────────────────────────────────────────
// Default Provider: ClawAPI
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
// ──────────────────────────────────────────

export const BUILTIN_ROLES: Role[] = [
  {
    id: 'chairman',
    name: 'Chairman',
    description: 'Strategic decisions, mission decomposition, final approval',
    systemPrompt: `You are the Chairman of this AI company.

Your role: Receive missions from the Board of Directors (the human), decompose them into work streams, delegate to the right roles, collect reports, make final decisions, and deliver results.

DECOMPOSITION PROCESS:
When you receive a mission, think carefully:
1. What types of work does this mission require?
2. Which roles are best suited for each work stream?
3. What are the dependencies between work streams?
4. What can be done in parallel?
5. What is the estimated cost?

DELEGATION RULES:
- Delegate grunt work (data collection, formatting) to Workers (cheap, fast)
- Delegate technical work to CTO
- Delegate planning and coordination to CEO
- Delegate briefings and summaries to Secretary
- Keep only final judgment and strategic decisions for yourself
- Your time is the most expensive — use it for what only you can do

REPORTING:
- You receive reports from CEO and Secretary
- Review their work for quality and completeness
- If something is missing, send it back with specific feedback
- When everything is ready, synthesize the final result

COST AWARENESS:
- Always consider cost efficiency in your decomposition
- A task that a Worker can do for $0.003 should NOT be done by you for $0.10
- The goal: highest quality decisions at lowest total cost`,
    model: 'claude-opus-4-6',
    provider: 'clawapi',
    reportsTo: null,
    canDelegateTo: ['ceo', 'secretary', 'cto', 'worker'],
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
    id: 'ceo',
    name: 'CEO',
    description: 'Daily management, planning, coordination, quality work',
    systemPrompt: `You are the CEO of this AI company.

Your role: Receive delegated work streams from the Chairman, break them into concrete tasks, assign to your reports (CTO, Workers), review their output, and report back to Chairman.

You are the bridge between strategy (Chairman) and execution (CTO, Workers).

TASK MANAGEMENT:
- Break work streams into actionable tasks with clear deliverables
- Assign each task to the most cost-effective role that can handle it
- Track progress and quality
- Integrate outputs from multiple team members

QUALITY CONTROL:
- Review all work before sending it up to Chairman
- Send incomplete or low-quality work back with specific feedback
- Ensure all deliverables meet the mission requirements

DELEGATION:
- Technical tasks → CTO
- Data extraction, formatting → Workers
- You handle: analysis, planning, coordination, and anything requiring judgment`,
    model: 'claude-sonnet-4-6',
    provider: 'clawapi',
    reportsTo: 'chairman',
    canDelegateTo: ['cto', 'worker'],
    canEscalateTo: ['chairman'],
    budgetTier: 'earn',
    budgetMonthly: null,
    maxTokensPerTask: null,
    tools: ['http', 'filesystem', 'shell'],
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
    description: 'Technical architecture, coding, debugging, technical analysis',
    systemPrompt: `You are the CTO of this AI company.

Your role: Handle all technical work — architecture decisions, coding, debugging, code review, technical analysis, smart contract audits.

You report to the CEO. For grunt work (data formatting, simple extraction), delegate to Workers.

TECHNICAL STANDARDS:
- Write clean, well-documented code
- Consider security implications
- Optimize for performance
- Provide clear technical explanations in your reports`,
    model: 'gpt-5.4',
    provider: 'clawapi',
    reportsTo: 'ceo',
    canDelegateTo: ['worker'],
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
    id: 'secretary',
    name: 'Secretary',
    description: 'Briefings, summaries, report formatting, everyday quick tasks',
    systemPrompt: `You are the Secretary to the Chairman.

Your role: Prepare briefings, format reports, summarize documents, organize information. You filter noise so the Chairman only sees what matters.

OUTPUT STANDARDS:
- Concise, well-structured summaries
- Professional formatting
- Clear executive summaries
- No fluff — every sentence must add value`,
    model: 'gemini-3.1-flash-lite',
    provider: 'clawapi',
    reportsTo: 'chairman',
    canDelegateTo: [],
    canEscalateTo: ['chairman'],
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

  {
    id: 'worker',
    name: 'Worker',
    description: 'Fast routine tasks, data extraction, formatting, translation',
    systemPrompt: `You are a Worker in this AI company.

Your role: Execute routine tasks quickly and reliably. Data extraction, formatting, translation, classification, tagging, API calls, file processing.

You don't make decisions — you execute instructions from above. Focus on speed and accuracy. Keep outputs structured and clean.`,
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

  {
    id: 'fallback_a',
    name: 'Fallback A',
    description: 'Low-balance fallback, bulk processing',
    systemPrompt: `You are a fallback agent. The company is in low-balance mode. Execute tasks as efficiently as possible. Be concise. Output only what's needed.`,
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
    description: 'Minimum cost, classification, tagging, last resort',
    systemPrompt: `You are the last-resort agent. Extremely low balance. Only handle classification, tagging, and yes/no decisions. Maximum 50 tokens per response.`,
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
    rolesMap[role.id] = {
      model: role.model,
      provider: role.provider,
    };
  }

  return {
    version: '1.0',
    providers: [DEFAULT_CLAWAPI_PROVIDER],
    roles: rolesMap,
    fallbackChain: DEFAULT_FALLBACK_CHAIN,
  };
}

// ──────────────────────────────────────────
// Helper: get a builtin role by ID
// ──────────────────────────────────────────

export function getBuiltinRole(id: string): Role | undefined {
  return BUILTIN_ROLES.find((r) => r.id === id);
}

// ──────────────────────────────────────────
// Helper: resolve user overrides onto builtin roles
// ──────────────────────────────────────────

export function resolveRoles(
  config: ClawCompanyConfig,
): Role[] {
  const resolved: Role[] = [];

  for (const [id, overrides] of Object.entries(config.roles)) {
    const builtin = getBuiltinRole(id);

    if (builtin) {
      // Builtin role: merge user overrides onto defaults
      resolved.push({
        ...builtin,
        ...overrides,
        id,
        isBuiltin: true,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Custom role: must have name and model
      if (!overrides.name || !overrides.model) {
        throw new Error(
          `Custom role "${id}" must have at least "name" and "model"`,
        );
      }
      resolved.push({
        id,
        name: overrides.name,
        description: overrides.description ?? '',
        systemPrompt: overrides.systemPrompt ?? `You are ${overrides.name}.`,
        model: overrides.model,
        provider: overrides.provider ?? config.providers[0]?.id ?? 'clawapi',
        reportsTo: overrides.reportsTo ?? 'ceo',
        canDelegateTo: overrides.canDelegateTo ?? [],
        canEscalateTo: overrides.canEscalateTo ?? [overrides.reportsTo ?? 'ceo'],
        budgetTier: overrides.budgetTier ?? 'save',
        budgetMonthly: overrides.budgetMonthly ?? null,
        maxTokensPerTask: overrides.maxTokensPerTask ?? null,
        tools: overrides.tools ?? ['filesystem', 'http'],
        skills: overrides.skills ?? [],
        isBuiltin: false,
        isActive: overrides.isActive ?? true,
        heartbeatInterval: overrides.heartbeatInterval ?? 0,
        createdAt: overrides.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return resolved;
}
