#!/bin/bash
set -euo pipefail

USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
THRESHOLD=80

if [ "$USAGE" -gt "$THRESHOLD" ]; then
    echo "WARNING: Disk usage at ${USAGE}%"
    exit 1
fi

echo "Disk usage OK at ${USAGE}%"
