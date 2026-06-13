#!/usr/bin/env bash
set -euo pipefail 
# -e exit in case of error in one instruction; -u error if using a non declared variable; 
# -o pipefail returns the exit code of the first command to fail or the last command to succeed

PKG_DIR="$(pwd)"
TEST_APP="test"

echo $PKG_DIR

npm run build

# Salva nome tarball (gestisco versione e scope)
TARBALL=$(npm pack --silent)

rm -f "$PWD/$TEST_APP/package-lock.json"
npm install "$PKG_DIR/$TARBALL" --prefix "$PWD/$TEST_APP" --no-save --force # avoid caching with --no-save --force

# Copia il tarball nel contesto Docker del test app
cp "$TARBALL" "$PWD/$TEST_APP/propeller-framework.tgz"

rm -f "$TARBALL"

echo "Installed Propeller in test suite."