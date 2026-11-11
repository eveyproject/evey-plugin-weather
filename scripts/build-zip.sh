#!/usr/bin/env bash
# Builds out/<name>-<version>.zip, the file a release publishes and signs.
# The same commit gives the same bytes: a rebuild can be compared with the
# published zip. A cosign.pub at the repository root (written by the release
# workflow) goes into the zip, where Evey reads the publisher's key.
set -euo pipefail
cd "$(dirname "$0")/.."

name=$(sed -n 's/^name: *//p' plugin.yaml)
version=$(sed -n 's/^version: *//p' plugin.yaml)
epoch=${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct)}

npm ci --no-audit --no-fund
npm run typecheck --if-present
npm test
npm run build --if-present
npm prune --omit=dev --no-audit --no-fund

# Only the backend's runtime dependencies ship; tests, docs, type definitions
# and sources inside node_modules would only feed the install-time analyzer.
if [ -d node_modules ]; then
  find node_modules -type d \( -iname test -o -iname tests -o -iname __tests__ -o -iname doc \
    -o -iname docs -o -iname example -o -iname examples -o -iname .github -o -iname .bin \) \
    -prune -exec rm -rf {} +
  find node_modules -type f \( -name '*.md' -o -name '*.markdown' -o -name '*.map' \
    -o -name '*.d.ts' -o -name '*.ts' -o -name '.npmignore' -o -name '.eslintrc*' \) -delete
  find node_modules -mindepth 1 -maxdepth 1 -type d -name '.*' -exec rm -rf {} +
  find node_modules -depth -type d -empty -delete
fi

payload=$(ls -A | grep -vxE 'src|tests|out|scripts|\.git|\.github|\.gitignore|README\.md|package\.json|package-lock\.json|tsconfig\.json|vitest\.config\.ts|cosign\.pub' | tr '\n' ' ')

# A metadata-only package.json: scripts and dev tooling stay out of the zip.
pkg_tmp=$(mktemp)
node -e '
  const p = require("./package.json");
  process.stdout.write(JSON.stringify({ name: p.name, version: p.version, private: true }, null, 2) + "\n");
' > "$pkg_tmp"

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
for f in $payload; do
  [ -e "$f" ] && cp -rL "$f" "$stage/"
done
if [ -f cosign.pub ]; then
  cp cosign.pub "$stage/cosign.pub"
fi
cp "$pkg_tmp" "$stage/package.json"
rm -f "$pkg_tmp"
chmod -R u=rwX,go=rX "$stage"
find "$stage" -exec touch -h -d "@$epoch" {} +

mkdir -p out
out="out/$name-$version.zip"
rm -f "$out"
(cd "$stage" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | TZ=UTC zip -q -X -D -@ "$OLDPWD/$out")
echo "$out"
