#!/bin/bash
# Test script for Nora Policy MCP Server
# Run: ./test-policies.sh

echo "=========================================="
echo "🏥 Nora Policy MCP - Test Suite"
echo "=========================================="
echo ""

echo "1️⃣  Creating Dr. Hill's Office Hours (9-5, Mon-Fri)..."
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"policy_create","arguments":{"doctorId":"dr-hill","policyType":"AVAILABILITY","label":"Office Hours","policyData":{"policyType":"AVAILABILITY","recurrence":{"type":"weekly","daysOfWeek":[1,2,3,4,5],"startDate":"2026-01-30","endDate":null},"timeWindows":[{"start":"09:00","end":"17:00"}]}}}}' | node dist/index.js
echo ""
echo ""

echo "2️⃣  Creating Dr. Hill's Lunch Block (12-1pm daily)..."
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"policy_create","arguments":{"doctorId":"dr-hill","policyType":"BLOCK","label":"Lunch Break","policyData":{"policyType":"BLOCK","recurrence":{"type":"daily","startDate":"2026-01-30","endDate":null},"timeWindows":[{"start":"12:00","end":"13:00"}],"reason":"Lunch break"}}}}' | node dist/index.js
echo ""
echo ""

echo "3️⃣  Creating New Patient appointment type (45 min)..."
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"policy_create","arguments":{"doctorId":"dr-hill","policyType":"APPOINTMENT_TYPE","label":"New Patient Visit","policyData":{"policyType":"APPOINTMENT_TYPE","typeName":"New Patient","duration":45,"color":"#4CAF50"}}}}' | node dist/index.js
echo ""
echo ""

echo "4️⃣  Listing all policies for Dr. Hill..."
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"policy_list","arguments":{"doctorId":"dr-hill"}}}' | node dist/index.js
echo ""
echo ""

echo "5️⃣  Checking: Can we book at 10am Monday? (should be OK)"
echo '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"policy_check","arguments":{"doctorId":"dr-hill","action":"book","dateTime":"2026-02-02T10:00:00","duration":30}}}' | node dist/index.js
echo ""
echo ""

echo "6️⃣  Checking: Can we book at 12:30pm? (should CONFLICT - lunch)"
echo '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"policy_check","arguments":{"doctorId":"dr-hill","action":"book","dateTime":"2026-02-02T12:30:00","duration":30}}}' | node dist/index.js
echo ""
echo ""

echo "7️⃣  Getting policy explanation for Dr. Hill..."
echo '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"policy_explain","arguments":{"doctorId":"dr-hill"}}}' | node dist/index.js
echo ""
echo ""

echo "=========================================="
echo "✅ Test complete!"
echo "=========================================="
