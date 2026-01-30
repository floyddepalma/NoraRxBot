/**
 * Policy Store
 * 
 * SQLite-based storage for scheduling policies.
 * Uses better-sqlite3 for synchronous, fast queries.
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { 
  type Policy, 
  type PolicyData, 
  type PolicyType,
  POLICY_TYPE_LABELS 
} from "../schemas/policy-schema.js";

// =============================================================================
// Database Setup
// =============================================================================

const DB_PATH = process.env.NORA_DB_PATH || "./data/policies.db";

export class PolicyStore {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS policies (
        id TEXT PRIMARY KEY,
        doctor_id TEXT NOT NULL,
        policy_type TEXT NOT NULL,
        label TEXT NOT NULL,
        policy_data TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_policies_doctor ON policies(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(policy_type);
      CREATE INDEX IF NOT EXISTS idx_policies_active ON policies(is_active);
    `);
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /** List policies with optional filters */
  list(filters: {
    doctorId?: string;
    policyType?: PolicyType;
    activeOnly?: boolean;
  } = {}): Policy[] {
    let sql = "SELECT * FROM policies WHERE 1=1";
    const params: unknown[] = [];

    if (filters.doctorId) {
      sql += " AND doctor_id = ?";
      params.push(filters.doctorId);
    }

    if (filters.policyType) {
      sql += " AND policy_type = ?";
      params.push(filters.policyType);
    }

    if (filters.activeOnly !== false) {
      sql += " AND is_active = 1";
    }

    sql += " ORDER BY created_at DESC";

    const rows = this.db.prepare(sql).all(...params) as DbRow[];
    return rows.map(this.rowToPolicy);
  }

  /** Get a single policy by ID */
  get(id: string): Policy | null {
    const row = this.db.prepare("SELECT * FROM policies WHERE id = ?").get(id) as DbRow | undefined;
    return row ? this.rowToPolicy(row) : null;
  }

  /** Create a new policy */
  create(input: {
    doctorId: string;
    policyType: PolicyType;
    label: string;
    policyData: PolicyData;
  }): Policy {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO policies (id, doctor_id, policy_type, label, policy_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.doctorId,
      input.policyType,
      input.label,
      JSON.stringify(input.policyData),
      now,
      now
    );

    return this.get(id)!;
  }

  /** Update an existing policy */
  update(id: string, updates: {
    label?: string;
    policyData?: object;
    isActive?: boolean;
  }): Policy | null {
    const existing = this.get(id);
    if (!existing) return null;

    const sets: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.label !== undefined) {
      sets.push("label = ?");
      params.push(updates.label);
    }

    if (updates.policyData !== undefined) {
      sets.push("policy_data = ?");
      params.push(JSON.stringify(updates.policyData));
    }

    if (updates.isActive !== undefined) {
      sets.push("is_active = ?");
      params.push(updates.isActive ? 1 : 0);
    }

    params.push(id);

    this.db.prepare(`UPDATE policies SET ${sets.join(", ")} WHERE id = ?`).run(...params);

    return this.get(id);
  }

  /** Soft-delete a policy (set inactive) */
  delete(id: string): boolean {
    const result = this.db.prepare("UPDATE policies SET is_active = 0, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  // ===========================================================================
  // Business Logic
  // ===========================================================================

  /** Check if an action conflicts with any policies */
  checkConflicts(input: {
    doctorId: string;
    action: "book" | "block" | "reschedule";
    dateTime: Date;
    duration: number;
  }): { allowed: boolean; conflicts: string[]; } {
    const policies = this.list({ doctorId: input.doctorId, activeOnly: true });
    const conflicts: string[] = [];
    
    const dayOfWeek = input.dateTime.getDay();
    const timeStr = input.dateTime.toTimeString().slice(0, 5); // HH:MM
    const dateStr = input.dateTime.toISOString().slice(0, 10); // YYYY-MM-DD

    for (const policy of policies) {
      const data = policy.policyData;

      switch (data.policyType) {
        case "AVAILABILITY": {
          // Check if this time falls within availability
          const isWithinAvailability = this.isTimeInWindows(timeStr, data.timeWindows);
          const isOnCorrectDay = this.isOnRecurrenceDay(dayOfWeek, dateStr, data.recurrence);
          
          if (isOnCorrectDay && !isWithinAvailability && input.action === "book") {
            conflicts.push(`Outside working hours (${policy.label})`);
          }
          break;
        }

        case "BLOCK": {
          // Check if this time falls within a block
          const isBlocked = this.isTimeInWindows(timeStr, data.timeWindows);
          const isOnBlockDay = this.isOnRecurrenceDay(dayOfWeek, dateStr, data.recurrence);
          
          if (isOnBlockDay && isBlocked && input.action === "book") {
            conflicts.push(`Time is blocked: ${data.reason || policy.label}`);
          }
          break;
        }

        case "OVERRIDE": {
          // Check date-specific overrides
          if (data.date === dateStr) {
            const isInWindow = this.isTimeInWindows(timeStr, data.timeWindows);
            if (isInWindow && data.action === "block" && input.action === "book") {
              conflicts.push(`Override block: ${data.reason || policy.label}`);
            }
          }
          break;
        }

        case "BOOKING_WINDOW": {
          // Check if booking is within allowed window
          const now = new Date();
          const hoursUntil = (input.dateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
          const daysUntil = hoursUntil / 24;

          if (input.action === "book") {
            if (hoursUntil < data.minAdvanceHours) {
              conflicts.push(`Must book at least ${data.minAdvanceHours} hours in advance`);
            }
            if (daysUntil > data.maxAdvanceDays) {
              conflicts.push(`Cannot book more than ${data.maxAdvanceDays} days in advance`);
            }
          }
          break;
        }
      }
    }

    return {
      allowed: conflicts.length === 0,
      conflicts
    };
  }

  /** Generate human-readable explanation of policies */
  explain(doctorId: string): string {
    const policies = this.list({ doctorId, activeOnly: true });
    
    if (policies.length === 0) {
      return "No scheduling policies configured.";
    }

    const sections: string[] = [];

    // Group by type
    const byType = new Map<PolicyType, Policy[]>();
    for (const policy of policies) {
      const existing = byType.get(policy.policyType) || [];
      existing.push(policy);
      byType.set(policy.policyType, existing);
    }

    // Generate explanation for each type
    for (const [type, typePolicies] of byType) {
      const typeLabel = POLICY_TYPE_LABELS[type as PolicyType];
      const items = typePolicies.map(p => `  • ${p.label}`).join("\n");
      sections.push(`**${typeLabel}:**\n${items}`);
    }

    return sections.join("\n\n");
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private isTimeInWindows(time: string, windows: Array<{ start: string; end: string }>): boolean {
    return windows.some(w => time >= w.start && time < w.end);
  }

  private isOnRecurrenceDay(
    dayOfWeek: number, 
    dateStr: string, 
    recurrence: { type: string; daysOfWeek?: number[]; startDate: string; endDate: string | null }
  ): boolean {
    // Check date range
    if (dateStr < recurrence.startDate) return false;
    if (recurrence.endDate && dateStr > recurrence.endDate) return false;

    switch (recurrence.type) {
      case "daily":
        return true;
      case "weekly":
      case "biweekly":
        return recurrence.daysOfWeek?.includes(dayOfWeek) ?? false;
      case "once":
        return dateStr === recurrence.startDate;
      default:
        return false;
    }
  }

  private rowToPolicy(row: DbRow): Policy {
    return {
      id: row.id,
      doctorId: row.doctor_id,
      policyType: row.policy_type as PolicyType,
      label: row.label,
      policyData: JSON.parse(row.policy_data),
      isActive: row.is_active === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// Database row type
interface DbRow {
  id: string;
  doctor_id: string;
  policy_type: string;
  label: string;
  policy_data: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}
