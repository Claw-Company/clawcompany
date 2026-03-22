// ============================================================
// ClawCompany — Core Type Definitions
// Build for WEB4.0, Claws Autonomous.
// ============================================================

// ──────────────────────────────────────────
// Provider System
// ──────────────────────────────────────────

export type ProviderType =
  | 'openai-compatible' // ClawAPI, DeepSeek, Ollama, OpenRouter, SiliconFlow, vLLM
  | 'openai'            // OpenAI official
  | 'anthropic'         // Anthropic official
  | 'google-genai';     // Google AI official

export type ProviderTier =
  | 'default'    // ClawAPI — always first, always active
  | 'official'   // Anthropic, OpenAI, Google, Ollama — shown in setup, user can enable
  | 'custom';    // User-added via CLI — no restrictions, no approval needed

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiKey: string;
  isDefault?: boolean;
  models: ModelInfo[] | 'auto'; // 'auto' = discover from /models endpoint
  features?: {
    cryptoPayment?: boolean;
    multiModel?: boolean;
    autoFallback?: boolean;
  };
}

/**
 * Provider catalog entry — extends ProviderConfig with catalog metadata.
 * The catalog defines the default provider list shown during setup.
 * Position in this list has commercial value — new providers must negotiate.
 */
export interface ProviderCatalogEntry {
  id: string;
  name: string;
  type: ProviderType;
  tier: ProviderTier;
  position: number;           // Display order (1 = first)
  baseUrl: string;
  apiKeyEnvVar: string;       // e.g. 'CLAWAPI_KEY', 'ANTHROPIC_API_KEY'
  apiKeyPrefix?: string;      // e.g. 'sk-claw-', 'sk-ant-' for validation
  website: string;            // Where to get a key
  description: string;        // One-line description
  models: ModelInfo[] | 'auto';
  features?: {
    cryptoPayment?: boolean;
    multiModel?: boolean;
    autoFallback?: boolean;
    local?: boolean;          // Ollama — no API key needed
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  maxTokens?: number;
  pricing?: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
}

// ──────────────────────────────────────────
// Role System
// ──────────────────────────────────────────

export type BudgetTier = 'earn' | 'save' | 'survive';

export interface Role {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;

  // Model binding
  model: string;
  provider: string;

  // Org structure
  reportsTo: string | null;
  canDelegateTo: string[];
  canEscalateTo: string[];

  // Budget
  budgetTier: BudgetTier;
  budgetMonthly: number | null;     // USD, null = unlimited
  maxTokensPerTask: number | null;

  // Capabilities
  tools: string[];
  skills: string[];

  // Meta
  isBuiltin: boolean;
  isActive: boolean;
  heartbeatInterval: number; // seconds, 0 = passive only
  createdAt: string;
  updatedAt: string;
}

export type RoleInput = Partial<Role> & Pick<Role, 'name' | 'model'>;

export interface CompanyTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  roles: Role[];
}

// ──────────────────────────────────────────
// Company
// ──────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  mission: string;
  roles: Role[];
  providers: ProviderConfig[];
  budget: {
    total: number;
    spent: number;
    currency: 'USD';
  };
  fallbackChain: string[]; // model IDs in order
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────
// Mission & Task System
// ──────────────────────────────────────────

export type MissionStatus =
  | 'created'
  | 'decomposing'
  | 'delegated'
  | 'executing'
  | 'reporting'
  | 'reviewing'
  | 'awaiting_approval'
  | 'approved'
  | 'revision_requested'
  | 'completed'
  | 'failed';

export interface Mission {
  id: string;
  companyId: string;
  content: string;
  status: MissionStatus;
  priority: 'critical' | 'high' | 'normal' | 'low';
  deadline?: string;
  budgetLimit?: number;
  approvalRequired: boolean;
  decomposition?: WorkStream[];
  result?: MissionResult;
  totalCost: number;
  createdAt: string;
  completedAt?: string;
}

export interface WorkStream {
  id: string;
  missionId: string;
  title: string;
  description: string;
  assignTo: string;          // role ID
  dependencies: string[];    // other WorkStream IDs
  estimatedComplexity: 'low' | 'medium' | 'high';
  requiredTools: string[];
  status: 'pending' | 'assigned' | 'executing' | 'completed' | 'failed';
}

export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'revision'
  | 'completed'
  | 'failed';

export interface Task {
  id: string;
  companyId: string;
  missionId: string;
  workStreamId?: string;
  parentTaskId?: string;     // for sub-delegation

  title: string;
  description: string;
  context?: Record<string, unknown>;

  assignedTo: string;        // role ID
  createdBy: string;         // role ID or 'human'
  reportTo: string;          // role ID to report results to

  status: TaskStatus;
  priority: number;
  result?: string;
  feedback?: string;         // from reviewer

  // Cost tracking
  tokensIn: number;
  tokensOut: number;
  cost: number;
  modelUsed: string;

  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface MissionResult {
  summary: string;
  deliverables: Deliverable[];
  totalCost: number;
  agentBreakdown: AgentCostEntry[];
  humanAction?: 'approved' | 'revision_requested' | 'overridden';
  humanFeedback?: string;
}

export interface Deliverable {
  type: 'text' | 'file' | 'data' | 'report';
  title: string;
  content: string;
  format?: string;
}

export interface AgentCostEntry {
  roleId: string;
  roleName: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  tasksCompleted: number;
}

// ──────────────────────────────────────────
// Agent Communication
// ──────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ──────────────────────────────────────────
// Report Chain
// ──────────────────────────────────────────

export interface Report {
  id: string;
  taskId: string;
  from: string;          // role ID
  to: string;            // role ID
  status: 'completed' | 'blocked' | 'needs_revision';
  summary: string;
  output: unknown;
  cost: number;
  tokenUsage: number;
  issues?: string[];
  createdAt: string;
}

export type ReviewDecision = 'approved' | 'revision_needed' | 'escalate';

export interface ReviewResult {
  decision: ReviewDecision;
  feedback?: string;
  integratedOutput?: unknown;
}

// ──────────────────────────────────────────
// Chat / LLM Interface
// ──────────────────────────────────────────

export interface ChatParams {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ──────────────────────────────────────────
// Audit Log
// ──────────────────────────────────────────

export type AuditAction =
  | 'mission_created'
  | 'mission_decomposed'
  | 'task_delegated'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'report_submitted'
  | 'report_reviewed'
  | 'mission_delivered'
  | 'human_approved'
  | 'human_revised'
  | 'human_overridden'
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'provider_added'
  | 'provider_removed'
  | 'budget_exceeded'
  | 'fallback_triggered';

export interface AuditEntry {
  id: string;
  companyId: string;
  roleId?: string;
  action: AuditAction;
  details: Record<string, unknown>;
  cost?: number;
  createdAt: string;
}

// ──────────────────────────────────────────
// Scheduler — Cron Routines
// ──────────────────────────────────────────

export interface Routine {
  id: string;
  /** Human-readable name, e.g. "Daily market brief" */
  name: string;
  /** Cron expression: minute hour day month weekday */
  cron: string;
  /** Mission goal template. Can use {date}, {weekday}, {company} */
  mission: string;
  /** Which role initiates (default: researcher) */
  role?: string;
  /** Where to send results: 'telegram', 'discord', 'dashboard', 'all' */
  channel: string;
  /** Platform-specific chat ID for delivery */
  chatId?: string;
  /** Is this routine active? */
  enabled: boolean;
  /** Last execution timestamp */
  lastRunAt?: string;
  /** Last execution cost */
  lastCost?: number;
  /** Created timestamp */
  createdAt: string;
}

// ──────────────────────────────────────────
// Config file shape (~/.clawcompany/config.json)
// ──────────────────────────────────────────

export interface ClawCompanyConfig {
  version: string;
  providers: ProviderConfig[];
  roles: Record<string, Partial<Role>>;
  fallbackChain: string[];
  activeTemplate?: string;
}
