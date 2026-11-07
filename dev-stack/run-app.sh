#!/bin/bash
# (Re)start the built app for tests on :3000
pkill -f next-server; pkill -f "next start"; kill $(lsof -t -i:3000) 2>/dev/null; sleep 2
cd "$(dirname "$0")/.."
ALLOW_PRIVATE_HOSTS=1 METADATA_SERVICE_URL=http://127.0.0.1:9911/microlink ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:9911 NEXT_TELEMETRY_DISABLED=1 nohup npx next start -p 3000 > /tmp/claude-0/next.log 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null localhost:3000/login && break; sleep 0.5; done
echo app up
