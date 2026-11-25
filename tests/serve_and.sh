#!/bin/sh
# Serve dist/ on port 8765 for the length of the given command.
cd "$(dirname "$0")/.."
(cd dist && python3 -m http.server 8765 >/tmp/http.log 2>&1) &
SRV=$!
sleep 1
"$@"
kill $SRV 2>/dev/null
