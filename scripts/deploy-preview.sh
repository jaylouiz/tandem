#!/usr/bin/env bash
# Publish the static demo of the current checkout as https://<owner>.github.io/tandem/<name>/ (gh-pages).
#   scripts/deploy-preview.sh <name>      name: pr-<n> or proto-<issue>
# Builds with DEMO_BASE=/tandem/<name>/ and adds one commit to gh-pages that replaces <name>/ and links it from the
# index. No checkout of gh-pages: the commit is built with a scratch index, so it works from any worktree.
# Deep links work because gh-pages' 404.html hands /tandem/(pr|proto)-<n>/… to that preview (src/demo/deeplink.ts).
set -euo pipefail
name=${1:?usage: deploy-preview.sh <pr-n|proto-n>}
[[ $name =~ ^(pr|proto)-[0-9]+$ ]] || { echo "name must be pr-<n> or proto-<n> (404.html routes only those)" >&2; exit 64; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

DEMO_BASE="/tandem/$name/" npm run build:demo >/dev/null

git fetch -q origin gh-pages
base=$(git rev-parse FETCH_HEAD)
GIT_INDEX_FILE="$tmp/dist.index" git --work-tree=dist/demo add -A -f .
tree=$(GIT_INDEX_FILE="$tmp/dist.index" git write-tree)

export GIT_INDEX_FILE="$tmp/pages.index"
git read-tree "$base"
git rm -r -q --cached --ignore-unmatch "$name" >/dev/null
git read-tree --prefix="$name/" "$tree"
git show "$base:index.html" >"$tmp/index.html"
if ! grep -q "href=\"$name/" "$tmp/index.html"; then
  sed -i.bak "s|</p>| · <a href=\"$name/\">$name</a></p>|" "$tmp/index.html"
  git update-index --add --cacheinfo "100644,$(git hash-object -w "$tmp/index.html"),index.html"
fi
commit=$(git commit-tree "$(git write-tree)" -p "$base" -m "Demo preview $name (static, demo data, runs in the page)")
unset GIT_INDEX_FILE
git push -q origin "$commit:refs/heads/gh-pages"
owner=$(git remote get-url origin | sed -E 's|.*github.com[:/]([^/]+)/.*|\1|')
echo "https://$owner.github.io/tandem/$name/ (GitHub Pages needs about a minute)"
