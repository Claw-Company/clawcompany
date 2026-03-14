import type { MissionStatus } from '@clawcompany/shared';

/**
 * Valid state transitions for a mission.
 * mission_created → decomposing → delegated → executing → reporting →
 * reviewing → awaiting_approval → approved/revision_requested → completed
 */
const TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  created:             ['decomposing'],
  decomposing:         ['delegated', 'failed'],
  delegated:           ['executing'],
  executing:           ['reporting', 'failed'],
  reporting:           ['reviewing'],
  reviewing:           ['awaiting_approval', 'executing'], // can loop back for revisions
  awaiting_approval:   ['approved', 'revision_requested', 'completed'],
  approved:            ['completed'],
  revision_requested:  ['decomposing', 'executing'], // partial re-run
  completed:           [],
  failed:              ['created'], // can retry
};

export class MissionLifecycle {
  private status: MissionStatus;

  constructor(initialStatus: MissionStatus = 'created') {
    this.status = initialStatus;
  }

  get current(): MissionStatus {
    return this.status;
  }

  /**
   * Attempt a state transition. Throws if invalid.
   */
  transition(to: MissionStatus): void {
    const allowed = TRANSITIONS[this.status];
    if (!allowed?.includes(to)) {
      throw new Error(
        `Invalid mission transition: ${this.status} → ${to}. Allowed: ${allowed?.join(', ') ?? 'none'}`,
      );
    }
    this.status = to;
  }

  /**
   * Check if a transition is valid without performing it.
   */
  canTransition(to: MissionStatus): boolean {
    return TRANSITIONS[this.status]?.includes(to) ?? false;
  }

  /**
   * Is the mission in a terminal state?
   */
  get isTerminal(): boolean {
    return this.status === 'completed' || this.status === 'failed';
  }
}
