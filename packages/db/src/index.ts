/**
 * ClawCompany Database Layer
 *
 * Uses PGlite (embedded Postgres) for development — zero config.
 * Point DATABASE_URL to a real Postgres for production.
 *
 * TODO: Drizzle schema + migrations (Step 2 of execution plan)
 */

export interface Database {
  // Companies
  createCompany(data: any): Promise<any>;
  getCompany(id: string): Promise<any>;

  // Missions
  createMission(data: any): Promise<any>;
  getMission(id: string): Promise<any>;
  updateMissionStatus(id: string, status: string): Promise<void>;

  // Tasks
  createTask(data: any): Promise<any>;
  getTask(id: string): Promise<any>;
  getTasksByMission(missionId: string): Promise<any[]>;
  updateTask(id: string, data: any): Promise<void>;

  // Audit
  logAudit(entry: any): Promise<void>;
  getAuditLog(companyId: string): Promise<any[]>;
}

/**
 * In-memory database for MVP development.
 * Will be replaced with Drizzle + PGlite in Step 2.
 */
export class InMemoryDatabase implements Database {
  private companies = new Map<string, any>();
  private missions = new Map<string, any>();
  private tasks = new Map<string, any>();
  private audit: any[] = [];

  async createCompany(data: any) {
    this.companies.set(data.id, data);
    return data;
  }
  async getCompany(id: string) {
    return this.companies.get(id) ?? null;
  }

  async createMission(data: any) {
    this.missions.set(data.id, data);
    return data;
  }
  async getMission(id: string) {
    return this.missions.get(id) ?? null;
  }
  async updateMissionStatus(id: string, status: string) {
    const m = this.missions.get(id);
    if (m) m.status = status;
  }

  async createTask(data: any) {
    this.tasks.set(data.id, data);
    return data;
  }
  async getTask(id: string) {
    return this.tasks.get(id) ?? null;
  }
  async getTasksByMission(missionId: string) {
    return Array.from(this.tasks.values()).filter((t) => t.missionId === missionId);
  }
  async updateTask(id: string, data: any) {
    const t = this.tasks.get(id);
    if (t) Object.assign(t, data);
  }

  async logAudit(entry: any) {
    this.audit.push({ ...entry, createdAt: new Date().toISOString() });
  }
  async getAuditLog(companyId: string) {
    return this.audit.filter((a) => a.companyId === companyId);
  }
}
