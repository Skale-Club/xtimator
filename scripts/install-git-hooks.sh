#!/bin/sh
# Install repo git hooks (gitleaks pre-commit secret scan)
# Run once after cloning: bash scripts/install-git-hooks.sh

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_SRC="$REPO_ROOT/scripts/git-hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

if [ ! -d "$HOOKS_SRC" ]; then
  echo "❌ $HOOKS_SRC not found — nothing to install"
  exit 1
fi

for hook in "$HOOKS_SRC"/*; do
  name=$(basename "$hook")
  cp "$hook" "$HOOKS_DST/$name"
  chmod +x "$HOOKS_DST/$name"
  echo "✓ installed $name"
done

# Verify gitleaks
if ! command -v gitleaks >/dev/null 2>&1; then
  if [ ! -x "$HOME/AppData/Local/Microsoft/WinGet/Links/gitleaks.exe" ] && \
     [ ! -x "/c/Users/$USER/AppData/Local/Microsoft/WinGet/Links/gitleaks.exe" ]; then
    echo ""
    echo "⚠️  gitleaks not installed — pre-commit hook will skip scanning until you install it"
    echo "   Windows: winget install gitleaks.gitleaks"
    echo "   macOS:   brew install gitleaks"
    echo "   Linux:   see https://github.com/gitleaks/gitleaks#installing"
  fi
fi

echo ""
echo "✅ git hooks installed. Pre-commit will now scan for secrets via gitleaks."
