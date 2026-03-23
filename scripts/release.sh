#!/bin/bash
# ClawCompany Release Script
# Usage: ./scripts/release.sh 0.14.0 0.15.0 "Feature Name"

OLD=$1
NEW=$2
FEATURE=$3

if [ -z "$OLD" ] || [ -z "$NEW" ] || [ -z "$FEATURE" ]; then
  echo "Usage: ./scripts/release.sh OLD_VERSION NEW_VERSION FEATURE_NAME"
  echo "Example: ./scripts/release.sh 0.14.0 0.15.0 'Trading Desk template'"
  exit 1
fi

echo "🦞 Releasing ClawCompany v$NEW — $FEATURE"

cd ~/Projects/clawcompany

# Bump version
sed -i '' "s/\"version\": \"$OLD\"/\"version\": \"$NEW\"/" cli/package.json
sed -i '' "s/ClawCompany v$OLD/ClawCompany v$NEW/" cli/src/utils.ts

# Build + publish
pnpm --filter clawcompany build
cd cli && npm publish --access public && cd ..

# Commit
git add -A
git commit -m "release: npm v$NEW — $FEATURE"
git push

# README
python3 -c "c=open('README.md').read().replace('v$OLD','v$NEW');open('README.md','w').write(c)"
git add -A
git commit -m "docs: README v$NEW"
git push

# Website
cd ~/Projects/clawcompany-site
python3 -c "c=open('index.html').read().replace('v$OLD','v$NEW');open('index.html','w').write(c)"
npx vercel --prod

echo "✅ v$NEW published! Now generate marketing content."
