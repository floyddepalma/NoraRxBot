/**
 * Policy Schema Definitions
 * 
 * These schemas define the structure of scheduling policies.
 * We use Zod for runtime validation with TypeScript type inference.
 * 
 * NOTE: We call these "policies" not "rules" (Bo's preference!)
 */

import { z } from "zod";

// =============================================================================
// Base Types
// =============================================================================

/** Days of week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
export const DayOfWeekSchema = z.number().min(0).max(6);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

/** Time window (e.g., 09:00 - 17:00) */
export const TimeWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format"),
}).refine(
  (data) => data.start < data.end,
  { message: "Start time must be before end time" }
);
export type TimeWindow = z.infer<typeof TimeWindowSchema>;

/** Recurrence pattern for repeating policies */
export const RecurrenceSchema = z.object({
  type: z.enum(["daily", "weekly", "biweekly", "monthly", "once"]),
  daysOfWeek: z.array(DayOfWeekSchema).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
}).refine(
  (data) => {
    // Weekly/biweekly must have daysOfWeek
    if (["weekly", "biweekly"].includes(data.type) && (!data.daysOfWeek || data.daysOfWeek.length === 0)) {
      return false;
    }
    return true;
  },
  { message: "Weekly/biweekly recurrence must specify daysOfWeek" }
);
export type Recurrence = z.infer<typeof RecurrenceSchema>;

// =============================================================================
// Policy Types (Discriminated Union)
// =============================================================================

/** AVAILABILITY - When the doctor is working */
export const AvailabilityPolicySchema = z.object({
  policyType: z.literal("AVAILABILITY"),
  recurrence: RecurrenceSchema,
  timeWindows: z.array(TimeWindowSchema).min(1),
});

/** BLOCK - Time blocks unavailable for appointments (lunch, admin, etc.) */
export const BlockPolicySchema = z.object({
  policyType: z.literal("BLOCK"),
  recurrence: RecurrenceSchema,
  timeWindows: z.array(TimeWindowSchema).min(1),
  reason: z.string().optional(),
});

/** OVERRIDE - One-time exceptions (vacation, special hours) */
export const OverridePolicySchema = z.object({
  policyType: z.literal("OVERRIDE"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  action: z.enum(["block", "available"]),
  timeWindows: z.array(TimeWindowSchema).min(1),
  reason: z.string().optional(),
});

/** DURATION - Default appointment lengths */
export const DurationPolicySchema = z.object({
  policyType: z.literal("DURATION"),
  defaultLength: z.number().min(5).max(480),
  bufferBefore: z.number().min(0).max(60).optional(),
  bufferAfter: z.number().min(0).max(60).optional(),
  maxPerDay: z.number().min(1).max(100).optional(),
});

/** APPOINTMENT_TYPE - Define appointment types with durations */
export const AppointmentTypePolicySchema = z.object({
  policyType: z.literal("APPOINTMENT_TYPE"),
  typeName: z.string().min(1),
  duration: z.number().min(5).max(480),
  bufferBefore: z.number().min(0).max(60).optional(),
  bufferAfter: z.number().min(0).max(60).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

/** BOOKING_WINDOW - How far in advance patients can book */
export const BookingWindowPolicySchema = z.object({
  policyType: z.literal("BOOKING_WINDOW"),
  minAdvanceHours: z.number().min(0),
  maxAdvanceDays: z.number().min(1).max(365),
}).refine(
  (data) => data.minAdvanceHours <= data.maxAdvanceDays * 24,
  { message: "minAdvanceHours must be less than maxAdvanceDays" }
);

// =============================================================================
// Combined Policy Schema
// =============================================================================

export const PolicyDataSchema = z.discriminatedUnion("policyType", [
  AvailabilityPolicySchema,
  BlockPolicySchema,
  OverridePolicySchema,
  DurationPolicySchema,
  AppointmentTypePolicySchema,
  BookingWindowPolicySchema,
]);

export type PolicyData = z.infer<typeof PolicyDataSchema>;
export type PolicyType = PolicyData["policyType"];

// =============================================================================
// Full Policy (with metadata)
// =============================================================================

export interface Policy {
  id: string;
  doctorId: string;
  policyType: PolicyType;
  label: string;
  policyData: PolicyData;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Validation Function
// =============================================================================

export function validatePolicy(data: unknown): { success: true; data: PolicyData } | { success: false; errors: string[] } {
  const result = PolicyDataSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
  return { success: false, errors };
}

// =============================================================================
// Policy Type Labels (for UI/explanations)
// =============================================================================

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  AVAILABILITY: "Working Hours",
  BLOCK: "Blocked Time",
  OVERRIDE: "Schedule Override",
  DURATION: "Appointment Duration",
  APPOINTMENT_TYPE: "Appointment Type",
  BOOKING_WINDOW: "Booking Window",
};
