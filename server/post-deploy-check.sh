#!/bin/bash
# ─── Post-Deploy Verification ──────────────────────────────────────────────
# Запускать после каждого деплоя для проверки что всё работает.
# Использование: ./post-deploy-check.sh [api_url]

set -euo pipefail

API="${1:-https://api.voronova.online}"
PASS=0
FAIL=0

check() {
  local name="$1" cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "Post-deploy checks: $API"
echo "─────────────────────────────────"

# 1. Health
check "GET /health returns 200" \
  "curl -sf '${API}/health' | grep -q '\"status\"'"

# 2. DB connectivity
check "DB is reachable (health.db=ok)" \
  "curl -sf '${API}/health' | grep -q '\"db\":\"ok\"'"

# 3. Recipes API
check "GET /content/recipes returns array" \
  "curl -sf '${API}/content/recipes' | grep -q '^\['"

# 4. Categories API
check "GET /content/categories returns array" \
  "curl -sf '${API}/content/categories' | grep -q '^\['"

# 5. Auth endpoint exists
check "POST /auth/send-code returns 400 (no body)" \
  "test \$(curl -s -o /dev/null -w '%{http_code}' -X POST '${API}/auth/send-code' -H 'Content-Type: application/json' -d '{}') = '400'"

# 6. OAuth endpoints exist
check "GET /auth/oauth/vk redirects" \
  "test \$(curl -s -o /dev/null -w '%{http_code}' '${API}/auth/oauth/vk') -ge 300"

# 7. SSL valid
API_HOST=$(echo "$API" | sed -E 's|https?://||;s|/.*||;s|:.*||')
check "SSL certificate valid" \
  "echo | openssl s_client -connect ${API_HOST}:443 -servername ${API_HOST} 2>/dev/null | openssl x509 -noout -checkend 86400"

echo "─────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  echo "⚠️  Deploy verification FAILED"
  exit 1
else
  echo "✅ Deploy verified"
fi
