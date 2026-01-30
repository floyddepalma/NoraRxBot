/**
 * Policy Store - Neon/Postgres Edition
 * 
 * Serverless Postgres storage for scheduling policies.
 * Uses @neondatabase/serverless for edge-compatible queries.
 */

import { neon } from "@neondatabase/serverless";
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

export class PolicyStore {
  private sql: ReturnType<typeof neon>;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    this.sql = neon(databaseUrl);
  }

  /** Initialize database tables (run once) */
  async init() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS policies (
        id TEXT PRIMARY KEY,
        doctor_id TEXT NOT NULL,
        policy_type TEXT NOT NULL,
        label TEXT NOT NULL,
        policy_data JSONB NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_policies_doctor ON policies(doctor_id)
    `;
    
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(policy_type)
    `;
    
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_policies_active ON policies(is_active)
    `;
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /** List policies with optional filters */
  async list(filters: {
    doctorId?: string;
    policyType?: PolicyType;
    activeOnly?: boolean;
  } = {}): Promise<Policy[]> {
    let rows;
    
    if (filters.doctorId && filters.policyType) {
      rows = await this.sql`
        SELECT * FROM policies 
        WHERE doctor_id = ${filters.doctorId}
          AND policy_type = ${filters.policyType}
          AND (${filters.activeOnly === false} OR is_active = true)
        ORDER BY created_at DESC
      `;
    } else if (filters.doctorId) {
      rows = await this.sql`
        SELECT * FROM policies 
        WHERE doctor_id = ${filters.doctorId}
          AND (${filters.activeOnly === false} OR is_active = true)
        ORDER BY created_at DESC
      `;
    } else if (filters.policyType) {
      rows = await this.sql`
        SELECT * FROM policies 
        WHERE policy_type = ${filters.policyType}
          AND (${filters.activeOnly === false} OR is_active = true)
        ORDER BY created_at DESC
      `;
    } else {
      rows = await this.sql`
        SELECT * FROM policies 
        WHERE (${filters.activeOnly === false} OR is_active = true)
        ORDER BY created_at DESC
      `;
    }

    return rows.map(this.rowToPolicy);
  }

  /** Get a single policy by ID */
  async get(id: string): Promise<Policy | null> {
    const rows = await this.sql`
      SELECT * FROM policies WHERE id = ${id}
    `;
    return rows[0] ? this.rowToPolicy(rows[0]) : null;
  }

  /** Create a new policy */
  async create(input: {
    doctorId: string;
    policyType: PolicyType;
    label: string;
    policyData: PolicyData;
  }): Promise<Policy> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await this.sql`
      INSERT INTO policies (id, doctor_id, policy_type, label, policy_data, created_at, updated_at)
      VALUES (${id}, ${input.doctorId}, ${input.policyType}, ${input.label}, ${JSON.stringify(input.policyData)}, ${now}, ${now})
    `;

    return (await this.get(id))!;
  }

  /** Update an existing policy */
  async update(id: string, updates: {
    label?: string;
    policyData?: object;
    isActive?: boolean;
  }): Promise<Policy | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    
    await this.sql`
      UPDATE policies SET
        label = COALESCE(${updates.label ?? null}, label),
        policy_data = COALESCE(${updates.policyData ? JSON.stringify(updates.policyData) : null}::jsonb, policy_data),
        is_active = COALESCE(${updates.isActive ?? null}, is_active),
        updated_at = ${now}
      WHERE id = ${id}
    `;

    return this.get(id);
  }

  /** Soft-delete a policy (set inactive) */
  async delete(id: string): Promise<boolean> {
    const result = await this.sql`
      UPDATE policies SET is_active = false, updated_at = ${new Date().toISOString()}
      WHERE id = ${id}
    `;
    return result.count > 0;
  }

  // ===========================================================================
  // Business Logic
  // ===========================================================================

  /** Check if an action conflicts with any policies */
  async checkConflicts(input: {
    doctorId: string;
    action: "book" | "block" | "reschedule";
    dateTime: Date;
    duration: number;
  }): Promise<{ allowed: boolean; conflicts: string[]; }> {
    const policies = await this.list({ doctorId: input.doctorId, activeOnly: true });
    const conflicts: string[] = [];
    
    const dayOfWeek = input.dateTime.getDay();
    const timeStr = input.dateTime.toTimeString().slice(0, 5); // HH:MM
    const dateStr = input.dateTime.toISOString().slice(0, 10); // YYYY-MM-DD

    for (const policy of policies) {
      const data = policy.policyData;

      switch (data.policyType) {
        case "AVAILABILITY": {
          const isWithinAvailability = this.isTimeInWindows(timeStr, data.timeWindows);
          const isOnCorrectDay = this.isOnRecurrenceDay(dayOfWeek, dateStr, data.recurrence);
          
          if (isOnCorrectDay && !isWithinAvailability && input.action === "book") {
            conflicts.push(`Outside working hours (${policy.label})`);
          }
          break;
        }

        case "BLOCK": {
          const isBlocked = this.isTimeInWindows(timeStr, data.timeWindows);
          const isOnBlockDay = this.isOnRecurrenceDay(dayOfWeek, dateStr, data.recurrence);
          
          if (isOnBlockDay && isBlocked && input.action === "book") {
            conflicts.push(`Time is blocked: ${data.reason || policy.label}`);
          }
          break;
        }

        case "OVERRIDE": {
          if (data.date === dateStr) {
            const isInWindow = this.isTimeInWindows(timeStr, data.timeWindows);
            if (isInWindow && data.action === "block" && input.action === "book") {
              conflicts.push(`Override block: ${data.reason || policy.label}`);
            }
          }
          break;
        }

        case "BOOKING_WINDOW": {
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
  async explain(doctorId: string): Promise<string> {
    const policies = await this.list({ doctorId, activeOnly: true });
    
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

  private rowToPolicy(row: Record<string, unknown>): Policy {
    return {
      id: row.id as string,
      doctorId: row.doctor_id as string,
      policyType: row.policy_type as PolicyType,
      label: row.label as string,
      policyData: row.policy_data as PolicyData,
      isActive: row.is_active as boolean,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
