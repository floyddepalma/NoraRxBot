# Nora Policies Skill

Manage scheduling policies for doctors via the Policy MCP Server.

## When to Use This Skill

Use this skill when the user (doctor or staff) wants to:
- Set up working hours / availability
- Block time (lunch, admin, vacation)
- Define appointment types and durations
- Check if a time slot is available
- View current scheduling policies
- Modify or remove existing policies

## Available MCP Tools

### policy_list
List all policies, optionally filtered.
```
Arguments:
- doctorId: string (optional) - Filter by doctor
- policyType: string (optional) - AVAILABILITY, BLOCK, OVERRIDE, DURATION, APPOINTMENT_TYPE, BOOKING_WINDOW
- activeOnly: boolean (default: true)
```

### policy_create
Create a new scheduling policy.
```
Arguments:
- doctorId: string (required) - Doctor this policy applies to
- policyType: string (required) - Type of policy
- label: string (required) - Human-readable name
- policyData: object (required) - Policy configuration (see examples below)
```

### policy_update
Update an existing policy.
```
Arguments:
- id: string (required) - Policy ID to update
- label: string (optional) - New label
- policyData: object (optional) - New configuration
- isActive: boolean (optional) - Enable/disable
```

### policy_delete
Soft-delete (deactivate) a policy.
```
Arguments:
- id: string (required) - Policy ID to delete
```

### policy_check
Check if an action conflicts with policies.
```
Arguments:
- doctorId: string (required)
- action: "book" | "block" | "reschedule"
- dateTime: string (ISO format)
- duration: number (minutes, default: 30)
```

### policy_explain
Get human-readable explanation of a doctor's policies.
```
Arguments:
- doctorId: string (required)
```

## Policy Types & Examples

### AVAILABILITY (Working Hours)
When the doctor is available for appointments.
```json
{
  "policyType": "AVAILABILITY",
  "recurrence": {
    "type": "weekly",
    "daysOfWeek": [1, 2, 3, 4, 5],
    "startDate": "2026-01-30",
    "endDate": null
  },
  "timeWindows": [{"start": "09:00", "end": "17:00"}]
}
```
**Natural language triggers:**
- "I work 9 to 5 Monday through Friday"
- "My hours are 8am to 4pm"
- "I'm available Tuesday and Thursday"

### BLOCK (Blocked Time)
Time unavailable for appointments.
```json
{
  "policyType": "BLOCK",
  "recurrence": {
    "type": "daily",
    "startDate": "2026-01-30",
    "endDate": null
  },
  "timeWindows": [{"start": "12:00", "end": "13:00"}],
  "reason": "Lunch break"
}
```
**Natural language triggers:**
- "Block 12 to 1 for lunch"
- "No appointments Friday afternoons"
- "Block 8am to 9am for admin time"

### OVERRIDE (One-Time Exception)
Single-day exceptions to regular schedule.
```json
{
  "policyType": "OVERRIDE",
  "date": "2026-12-25",
  "action": "block",
  "timeWindows": [{"start": "00:00", "end": "23:59"}],
  "reason": "Christmas Day"
}
```
**Natural language triggers:**
- "I'm off December 25th"
- "Block next Friday completely"
- "I'm out February 14th for vacation"

### APPOINTMENT_TYPE (Appointment Definitions)
Define appointment types with durations.
```json
{
  "policyType": "APPOINTMENT_TYPE",
  "typeName": "New Patient",
  "duration": 45,
  "color": "#4CAF50"
}
```
**Natural language triggers:**
- "New patient visits are 45 minutes"
- "Follow-ups should be 15 minutes"
- "Annual physicals take an hour"

### DURATION (Default Settings)
Default appointment length and limits.
```json
{
  "policyType": "DURATION",
  "defaultLength": 30,
  "bufferAfter": 5,
  "maxPerDay": 20
}
```
**Natural language triggers:**
- "Default appointments are 30 minutes"
- "Maximum 20 patients per day"
- "Add 5 minutes buffer between appointments"

### BOOKING_WINDOW (Booking Limits)
How far in advance patients can book.
```json
{
  "policyType": "BOOKING_WINDOW",
  "minAdvanceHours": 24,
  "maxAdvanceDays": 30
}
```
**Natural language triggers:**
- "Patients must book at least 24 hours ahead"
- "Allow booking up to 30 days out"

## Conversation Patterns

### Setting Up a New Doctor
1. Greet and ask about their typical schedule
2. Create AVAILABILITY policy for working hours
3. Ask about breaks → create BLOCK policies
4. Ask about appointment types → create APPOINTMENT_TYPE policies
5. Summarize with policy_explain

### Checking Availability
1. User asks "Can I book at [time]?"
2. Use policy_check with action="book"
3. If conflicts, explain why and suggest alternatives
4. If allowed, confirm the slot is open

### Modifying Policies
1. User asks to change something
2. Use policy_list to find existing policy
3. Use policy_update with the policy ID
4. Confirm the change

## Days of Week Reference
- 0 = Sunday
- 1 = Monday
- 2 = Tuesday
- 3 = Wednesday
- 4 = Thursday
- 5 = Friday
- 6 = Saturday

## Important Notes

1. **Always confirm before creating policies** - Repeat back what you understood
2. **Use policy_check before booking** - Never assume a slot is open
3. **Be specific about times** - "morning" is not specific; ask for exact times
4. **Remember the doctor context** - Use the correct doctorId for each operation
5. **Explain conflicts clearly** - When a booking isn't allowed, say WHY
