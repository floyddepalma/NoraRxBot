#!/bin/bash
# Send a "list tools" request to the MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
