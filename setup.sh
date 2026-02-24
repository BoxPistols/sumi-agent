#!/bin/bash
# ═══ Sumi Local Setup Script ═══
# Run: chmod +x setup.sh && ./setup.sh

set -e

echo "🔧 Sumi — Local Development Setup"
echo "========================================"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required (v20+). Install: https://nodejs.org/"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "❌ Git is required."; exit 1; }

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 20 ]; then
  echo "⚠️  Node.js v20+ recommended (current: $(node -v))"
fi

# Detect package manager
if command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
elif command -v yarn >/dev/null 2>&1; then
  PM="yarn"
else
  PM="npm"
fi
echo "📦 Package manager: $PM"

# Install dependencies
echo ""
echo "📥 Installing dependencies..."
$PM install

# Create .env.local if not exists
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "📝 Created .env.local (from .env.example)"
else
  echo "✓ .env.local already exists"
fi

# Git init if not already a repo
if [ ! -d .git ]; then
  echo ""
  echo "🔀 Initializing Git repository..."
  git init
  git add -A
  git commit -m "feat: initial commit — Sumi v1.0

- Monolith client component (RedactPro.tsx)
- Next.js 15 + React 19 + TypeScript
- Server-side scraping proxy (/api/scrape)
- 16 file format parsers
- Multi-provider AI (Claude/OpenAI/Gemini)
- Dark/light theme
- Mobile responsive
- Storage compatibility (artifact ↔ localStorage)

See docs/REFACTOR_PLAN.md for module decomposition roadmap."

  echo "✅ Git repo initialized with first commit"
else
  echo "✓ Git repo already exists"
fi

echo ""
echo "========================================"
echo "✅ Setup complete!"
echo ""
echo "  Start dev server:  $PM run dev"
echo "  Open:              http://localhost:3000"
echo "  Build:             $PM run build"
echo ""
echo "  Next steps:"
echo "  1. Add remote:     git remote add origin <your-repo-url>"
echo "  2. Push:           git push -u origin main"
echo "  3. See roadmap:    docs/REFACTOR_PLAN.md"
echo ""
