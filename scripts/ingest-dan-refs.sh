#!/usr/bin/env bash
# Batch ingest Dan ref pack into asset library
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/docs/dan-ref-intake"

if [[ ! -d "$DIR" ]]; then
  echo "Missing $DIR"
  exit 1
fi

npx pnpm@9.15.0 --filter @westbound/studio build

for f in "$DIR"/*.{png,jpg,wav,mp3}; do
  [[ -f "$f" ]] || continue
  ext="${f##*.}"
  type="image"
  [[ "$ext" == "wav" || "$ext" == "mp3" ]] && type="audio"
  echo "Ingesting $f..."
  node "$ROOT/packages/studio/dist/cli/ingest-asset.js" "$f" studio sammy_rane "$type" || true
done

echo "Done. Train LoRA from approved stills per infra/comfyui/README.md"
