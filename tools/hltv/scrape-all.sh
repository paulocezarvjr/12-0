#!/usr/bin/env bash
# Scrape HLTV per-event ratings for a list of event IDs. Each writes
# data/ratings/<auto-detected-majorId>.txt (nick / team / rating).
SCR=/home/user/code/12-0/tools/hltv/fetch-ratings.js
IDS=(1270 1333 1444 1553 1611 1666 1617 2027 2062 2471 2720 3247 3564 3883 4443 4866 6372 6586 6793 7148 7524 7902 8042)
n=0
for id in "${IDS[@]}"; do
  n=$((n + 1))
  echo "=== [$n/${#IDS[@]}] event $id @ $(date +%H:%M:%S) ==="
  timeout 150 xvfb-run -a node "$SCR" "$id" 2>&1 \
    | grep -E "^major:|^wrote|FATAL|Could not|No rating" || echo "  FAILED event $id"
done
echo "=== DONE. ratings files written: ==="
ls -1 /home/user/code/12-0/data/ratings/*.txt 2>/dev/null | sed 's#.*/##' | tr '\n' ' '; echo
