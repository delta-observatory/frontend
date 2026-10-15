#!/bin/sh
# Copy the shared API test vectors from one commit of the backend repository into vendor/api-vectors/.
# The frontend tests check the search, the fold, and the parameter checks against them.
# Usage: scripts/sync-api-vectors.sh <backend-commit-or-tag>
set -eu
REF="${1:?backend commit or tag required}"
HERE=$(cd "$(dirname "$0")/.." && pwd)
BACKEND="$HERE/../backend"
COMMIT=$(git -C "$BACKEND" rev-parse --verify "$REF^{commit}")
rm -rf "$HERE/vendor/api-vectors"
mkdir -p "$HERE/vendor/api-vectors"
git -C "$BACKEND" archive "$COMMIT" tests/vectors | tar -x --strip-components=2 -C "$HERE/vendor/api-vectors"
echo "$COMMIT" > "$HERE/vendor/api-vectors/SOURCE"
echo "vendored backend@$COMMIT tests/vectors"
