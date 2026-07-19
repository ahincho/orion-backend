# =============================================================================
# Build script for orion-node-shared Lambda Layer
# =============================================================================
# Compiles the @orion/shared workspace into dist/ and packages it as a
# Lambda Layer zip. The layer is mounted at /opt, so:
#   - require('@orion/shared/http') -> /opt/node_modules/@orion/shared/dist/http/index.js
#
# Output: ../orion-node-shared-layer.zip
#
# Usage:
#   bash build.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SHARED_SRC="$ROOT_DIR/shared"
LAYER_DIR="$SCRIPT_DIR/nodejs"
LAYER_ZIP="$SCRIPT_DIR/../orion-node-shared-layer.zip"

echo ">> Cleaning previous build artifacts..."
rm -rf "$LAYER_DIR"
rm -f "$LAYER_ZIP"

echo ">> Installing root + shared workspace dependencies..."
(cd "$ROOT_DIR" && npm install --no-audit --no-fund)

echo ">> Building @orion/shared workspace..."
(cd "$SHARED_SRC" && npm run build)

echo ">> Creating layer structure (nodejs/@orion/shared/)..."
mkdir -p "$LAYER_DIR/node_modules/@orion/shared"

# Copy compiled dist (with package.json + tsconfig.json for subpath exports)
cp -r "$SHARED_SRC/dist" "$LAYER_DIR/node_modules/@orion/shared/dist"
cp "$SHARED_SRC/package.json" "$LAYER_DIR/node_modules/@orion/shared/package.json"

# Rewrite the package.json in the layer to point at ./dist (avoid workspace refs)
node -e "
const fs = require('fs');
const path = '$LAYER_DIR/node_modules/@orion/shared/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
// Drop workspace-only fields
delete pkg.workspaces;
delete pkg.scripts;
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"

echo ">> Pruning unnecessary files..."
find "$LAYER_DIR/node_modules/@orion/shared" -type f -name '*.map' -delete 2>/dev/null || true
find "$LAYER_DIR/node_modules/@orion/shared" -type d -name '__tests__' -exec rm -rf {} + 2>/dev/null || true
find "$LAYER_DIR/node_modules/@orion/shared" -type f -name '*.test.js' -delete 2>/dev/null || true
find "$LAYER_DIR/node_modules/@orion/shared" -type f -name '*.test.d.ts' -delete 2>/dev/null || true

echo ">> Zipping layer..."
(cd "$SCRIPT_DIR" && zip -qr "$LAYER_ZIP" nodejs/)

echo ">> Layer built: $LAYER_ZIP"
echo ">> Size: $(du -h "$LAYER_ZIP" | cut -f1)"
