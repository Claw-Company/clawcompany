// ============================================================
// REST API Path Constants
// ============================================================

export const API = {
  health: '/api/health',

  // Companies
  companies: '/api/companies',
  company: (id: string) => `/api/companies/${id}`,

  // Roles
  roles: '/api/roles',
  role: (id: string) => `/api/roles/${id}`,

  // Providers
  providers: '/api/providers',
  provider: (id: string) => `/api/providers/${id}`,
  providerModels: (id: string) => `/api/providers/${id}/models`,

  // Missions
  missions: '/api/missions',
  mission: (id: string) => `/api/missions/${id}`,
  missionApprove: (id: string) => `/api/missions/${id}/approve`,
  missionRevise: (id: string) => `/api/missions/${id}/revise`,
  missionOverride: (id: string) => `/api/missions/${id}/override`,

  // Tasks
  tasks: '/api/tasks',
  task: (id: string) => `/api/tasks/${id}`,

  // Audit
  audit: '/api/audit',

  // Status
  status: '/api/status',
  balance: '/api/balance',
} as const;
