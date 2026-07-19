# =============================================================================
# Build script for orion-node-runtime Lambda Layer
# =============================================================================
# Installs production dependencies into ./nodejs/node_modules and zips them.
# Output: ../orion-node-runtime-layer.zip
#
# Compatible runtimes: nodejs24.x
# Lambda mounts the layer at /opt, so modules are importable from
# /opt/node_modules/ (which Node resolves via NODE_PATH automatically).
#
# Usage:
#   bash build.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAYER_DIR="$SCRIPT_DIR/nodejs"
LAYER_ZIP="$SCRIPT_DIR/../orion-node-runtime-layer.zip"

echo ">> Cleaning previous build artifacts..."
rm -rf "$LAYER_DIR"
rm -f "$LAYER_ZIP"

echo ">> Creating layer structure (nodejs/)..."
mkdir -p "$LAYER_DIR"

echo ">> Installing production dependencies..."
# --omit=dev excludes devDependencies. We pass --prefix so npm installs
# inside ./nodejs/ rather than the current dir.
npm install --omit=dev --omit=optional --prefix "$LAYER_DIR" --no-audit --no-fund

echo ">> Pruning unnecessary files to reduce layer size..."
# Remove .npm cache, README files, .d.ts maps for AWS SDK (keep .d.ts types),
# and any other non-runtime artifacts that bloat the layer.
find "$LAYER_DIR/node_modules" -type d -name '.bin' -exec rm -rf {} + 2>/dev/null || true
find "$LAYER_DIR/node_modules" -type f -name '*.md' -delete 2>/dev/null || true
find "$LAYER_DIR/node_modules" -type f -name '*.map' -delete 2>/dev/null || true
find "$LAYER_DIR/node_modules" -type f -name '.npmrc' -delete 2>/dev/null || true
find "$LAYER_DIR/node_modules" -type f -name 'CHANGELOG*' -delete 2>/dev/null || true

echo ">> Zipping layer..."
# Must be zipped from the parent so the root folder is `nodejs/`.
(cd "$SCRIPT_DIR" && zip -qr "$LAYER_ZIP" nodejs/)

echo ">> Layer built: $LAYER_ZIP"
echo ">> Size: $(du -h "$LAYER_ZIP" | cut -f1)"
