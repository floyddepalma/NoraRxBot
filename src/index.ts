#!/usr/bin/env node
/**
 * Nora Policy MCP Server
 * 
 * This is an MCP (Model Context Protocol) server that manages scheduling policies.
 * Nora (or any MCP-compatible agent) can call these tools to:
 * - List policies for a doctor
 * - Create new policies
 * - Check if an action conflicts with policies
 * - Get human-readable policy explanations
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { PolicyStore } from "./db/policy-store.js";
import { validatePolicy, type Policy, type PolicyType } from "./schemas/policy-schema.js";

// Initialize the policy store (SQLite)
const store = new PolicyStore();

// Define the tools this MCP server exposes
const TOOLS: Tool[] = [
  {
    name: "policy_list",
    description: "List all policies, optionally filtered by doctor or type",
    inputSchema: {
      type: "object",
      properties: {
        doctorId: { type: "string", description: "Filter by doctor ID" },
        policyType: { type: "string", description: "Filter by policy type (AVAILABILITY, BLOCK, etc.)" },
        activeOnly: { type: "boolean", description: "Only return active policies", default: true }
      }
    }
  },
  {
    name: "policy_get",
    description: "Get a single policy by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Policy ID" }
      },
      required: ["id"]
    }
  },
  {
    name: "policy_create",
    description: "Create a new scheduling policy",
    inputSchema: {
      type: "object",
      properties: {
        doctorId: { type: "string", description: "Doctor this policy applies to" },
        policyType: { 
          type: "string", 
          enum: ["AVAILABILITY", "BLOCK", "OVERRIDE", "DURATION", "APPOINTMENT_TYPE", "BOOKING_WINDOW"],
          description: "Type of policy"
        },
        label: { type: "string", description: "Human-readable label for this policy" },
        policyData: { type: "object", description: "Policy configuration (varies by type)" }
      },
      required: ["doctorId", "policyType", "label", "policyData"]
    }
  },
  {
    name: "policy_update",
    description: "Update an existing policy",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Policy ID to update" },
        label: { type: "string", description: "New label (optional)" },
        policyData: { type: "object", description: "New policy data (optional)" },
        isActive: { type: "boolean", description: "Set active/inactive (optional)" }
      },
      required: ["id"]
    }
  },
  {
    name: "policy_delete",
    description: "Delete (deactivate) a policy",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Policy ID to delete" }
      },
      required: ["id"]
    }
  },
  {
    name: "policy_check",
    description: "Check if a proposed action conflicts with any policies",
    inputSchema: {
      type: "object",
      properties: {
        doctorId: { type: "string", description: "Doctor to check policies for" },
        action: { type: "string", enum: ["book", "block", "reschedule"], description: "Action to check" },
        dateTime: { type: "string", description: "ISO datetime for the action" },
        duration: { type: "number", description: "Duration in minutes" }
      },
      required: ["doctorId", "action", "dateTime"]
    }
  },
  {
    name: "policy_explain",
    description: "Get a human-readable explanation of policies for a doctor",
    inputSchema: {
      type: "object",
      properties: {
        doctorId: { type: "string", description: "Doctor to explain policies for" }
      },
      required: ["doctorId"]
    }
  }
];

// Create the MCP server
const server = new Server(
  { name: "nora-policy-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "policy_list": {
        const policies = store.list({
          doctorId: args?.doctorId as string | undefined,
          policyType: args?.policyType as PolicyType | undefined,
          activeOnly: args?.activeOnly !== false
        });
        return { content: [{ type: "text", text: JSON.stringify(policies, null, 2) }] };
      }

      case "policy_get": {
        const policy = store.get(args?.id as string);
        if (!policy) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "Policy not found" }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(policy, null, 2) }] };
      }

      case "policy_create": {
        const policyData = {
          policyType: args?.policyType as PolicyType,
          ...args?.policyData as object
        };
        
        // Validate the policy against our schema
        const validation = validatePolicy(policyData);
        if (!validation.success) {
          return { 
            content: [{ 
              type: "text", 
              text: JSON.stringify({ error: "Invalid policy", details: validation.errors }) 
            }] 
          };
        }

        const policy = store.create({
          doctorId: args?.doctorId as string,
          policyType: args?.policyType as PolicyType,
          label: args?.label as string,
          policyData: validation.data
        });
        return { content: [{ type: "text", text: JSON.stringify(policy, null, 2) }] };
      }

      case "policy_update": {
        const updated = store.update(args?.id as string, {
          label: args?.label as string | undefined,
          policyData: args?.policyData as object | undefined,
          isActive: args?.isActive as boolean | undefined
        });
        if (!updated) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "Policy not found" }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
      }

      case "policy_delete": {
        const deleted = store.delete(args?.id as string);
        return { content: [{ type: "text", text: JSON.stringify({ success: deleted }) }] };
      }

      case "policy_check": {
        const conflicts = store.checkConflicts({
          doctorId: args?.doctorId as string,
          action: args?.action as "book" | "block" | "reschedule",
          dateTime: new Date(args?.dateTime as string),
          duration: (args?.duration as number) || 30
        });
        return { content: [{ type: "text", text: JSON.stringify(conflicts, null, 2) }] };
      }

      case "policy_explain": {
        const explanation = store.explain(args?.doctorId as string);
        return { content: [{ type: "text", text: explanation }] };
      }

      default:
        return { content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Nora Policy MCP server running on stdio");
}

main().catch(console.error);
