#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8080

# Check if server is already running on port 8080
if ! ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
    if ! netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
        # Start the server in the background
        cd "$DIR"
        python3 -m http.server "$PORT" &>/dev/null &
        # Wait for server to be ready
        for i in {1..20}; do
            if curl -s -o /dev/null "http://localhost:$PORT"; then
                break
            fi
            sleep 0.1
        done
    fi
fi

# Open the browser
xdg-open "http://localhost:$PORT"
