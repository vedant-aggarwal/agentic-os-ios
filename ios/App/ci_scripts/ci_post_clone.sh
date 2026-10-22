#!/bin/sh
# Xcode Cloud runs this right after cloning, before it resolves Swift packages.
# The Capacitor plugins live in node_modules and the web app is built into www/, so both must exist first.
set -e
brew install node
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci --no-audit --no-fund
node scripts/build-www.mjs
npx cap sync ios
