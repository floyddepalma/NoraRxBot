# Nora Policy MCP Server

An MCP (Model Context Protocol) server for managing Nora's scheduling policies.

## What is This?

This MCP server allows AI agents (like Nora) to manage scheduling policies through a standard interface. Policies define things like:

- **Working hours** (when the doctor is available)
- **Blocked time** (lunch, admin time, etc.)
- **Overrides** (vacation days, special hours)
- **Appointment types** (new patient = 45min, follow-up = 15min)
- **Booking windows** (patients can book 1-30 days in advance)

## Quick Start

```bash
# Install dependencies
npm install

# Create data directory
mkdir -p data

# Build
npm run build

# Run in development mode (auto-reload)
npm run dev
```

## Project Structure

```
src/
├── index.ts              # MCP server entry point
├── schemas/
│   └── policy-schema.ts  # Zod schemas for policy validation
└── db/
    └── policy-store.ts   # SQLite storage layer
```

## MCP Tools

This server exposes the following tools:

| Tool | Description |
|------|-------------|
| `policy_list` | List policies (filter by doctor, type, active) |
| `policy_get` | Get a single policy by ID |
| `policy_create` | Create a new policy (validates against schema) |
| `policy_update` | Update an existing policy |
| `policy_delete` | Soft-delete (deactivate) a policy |
| `policy_check` | Check if an action conflicts with policies |
| `policy_explain` | Get human-readable policy explanation |

## Policy Types

### AVAILABILITY
When the doctor is working.
```json
{
  "policyType": "AVAILABILITY",
  "recurrence": {
    "type": "weekly",
    "daysOfWeek": [1, 2, 3, 4, 5],
    "startDate": "2026-01-30",
    "endDate": null
  },
  "timeWindows": [{ "start": "09:00", "end": "17:00" }]
}
```

### BLOCK
Time unavailable for appointments.
```json
{
  "policyType": "BLOCK",
  "recurrence": { "type": "daily", "startDate": "2026-01-30", "endDate": null },
  "timeWindows": [{ "start": "12:00", "end": "13:00" }],
  "reason": "Lunch break"
}
```

### OVERRIDE
One-time exceptions.
```json
{
  "policyType": "OVERRIDE",
  "date": "2026-12-25",
  "action": "block",
  "timeWindows": [{ "start": "00:00", "end": "23:59" }],
  "reason": "Christmas"
}
```

### DURATION
Default appointment settings.
```json
{
  "policyType": "DURATION",
  "defaultLength": 30,
  "bufferAfter": 5,
  "maxPerDay": 20
}
```

### APPOINTMENT_TYPE
Named appointment types with specific durations.
```json
{
  "policyType": "APPOINTMENT_TYPE",
  "typeName": "New Patient",
  "duration": 45,
  "color": "#4CAF50"
}
```

### BOOKING_WINDOW
How far in advance patients can book.
```json
{
  "policyType": "BOOKING_WINDOW",
  "minAdvanceHours": 24,
  "maxAdvanceDays": 30
}
```

## Connecting to Clawdbot/Nora

To use this MCP server with Clawdbot, add it to your MCP configuration:

```json
{
  "mcpServers": {
    "nora-policies": {
      "command": "node",
      "args": ["/path/to/NoraRxBot/dist/index.js"],
      "env": {
        "NORA_DB_PATH": "/path/to/policies.db"
      }
    }
  }
}
```

## Development

```bash
# Run with auto-reload
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Nora Agent                         │
│                 (Clawdbot instance)                     │
└────────────────────────┬────────────────────────────────┘
                         │ MCP Protocol (stdio)
┌────────────────────────▼────────────────────────────────┐
│                  Policy MCP Server                      │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │   Tools      │  │    Schemas    │  │   Storage   │  │
│  │  (CRUD +     │  │   (Zod +      │  │  (SQLite)   │  │
│  │   check)     │  │  validation)  │  │             │  │
│  └──────────────┘  └───────────────┘  └─────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │    policies.db      │
              │   (SQLite file)     │
              └─────────────────────┘
```

## Next Steps

- [ ] Add Policy Skill for Nora
- [ ] Implement conflict detection improvements
- [ ] Add policy templates
- [ ] Web dashboard integration

---

Built with 🤖 by Floyd & Tessie
