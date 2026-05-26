#!/usr/bin/env bash
# Sync data files from the FDP shared data platform into map-compare/public/data/.
#
# Usage:
#   ./scripts/sync_data.sh
#   FDP_WORKSPACE=my_shapes ./scripts/sync_data.sh
#   ./scripts/sync_data.sh --dry-run

set -e

if [ -n "$CI" ]; then
  echo "CI environment — skipping FDP sync (data already in repo)"
  exit 0
fi

cd "$(dirname "$0")/.."

DEST="$(pwd)/public/data"
FDP_ROOT="${FDP_ROOT:-$(realpath ../fdp)}"

mkdir -p "$DEST"
echo "FDP root  : $FDP_ROOT"
echo "Dest      : $DEST"
echo ""

FDP_ROOT="$FDP_ROOT" python -m fdp.cli sync-app map_compare --dest "$DEST" "$@"
