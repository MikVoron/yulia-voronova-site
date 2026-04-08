#!/usr/bin/env bash
# Smoke tests for api.voronova.online
# Run: bash smoke-test.sh [base_url]
# Default: https://api.voronova.online

BASE="${1:-https://api.voronova.online}"
PASS=0
FAIL=0
TOTAL=0

check() {
  local name="$1" expect="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expect" ]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expect, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_contains() {
  local name="$1" needle="$2" haystack="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$haystack" | grep -qi "$needle"; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (missing: $needle)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Smoke Tests: $BASE ==="
echo ""

# ─── 1. Health ───
echo "[Health]"
resp=$(curl -s -w "\n%{http_code}" "$BASE/health")
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | head -1)
check "GET /health → 200" "200" "$code"
check_contains "/health returns ok" '"status":"ok"' "$body"

# ─── 2. Security Headers ───
echo "[Security Headers]"
headers=$(curl -sI "$BASE/health")
check_contains "X-Content-Type-Options" "nosniff" "$headers"
check_contains "X-Frame-Options" "SAMEORIGIN" "$headers"
check_contains "Strict-Transport-Security" "max-age=" "$headers"
check_contains "X-DNS-Prefetch-Control" "off" "$headers"

# ─── 3. CORS ───
echo "[CORS]"
cors=$(curl -sI -H "Origin: https://voronova.online" "$BASE/health")
check_contains "CORS allows voronova.online" "voronova.online" "$cors"
cors_bad=$(curl -sI -H "Origin: https://evil.com" "$BASE/health")
if echo "$cors_bad" | grep -qi "access-control-allow-origin: https://evil.com"; then
  echo "  ✗ CORS blocks evil.com (allowed!)"
  FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1))
else
  echo "  ✓ CORS blocks evil.com"
  PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1))
fi

# ─── 4. Public Content ───
echo "[Public Content]"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/content/news")
check "GET /content/news → 200" "200" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/content/recipes")
check "GET /content/recipes → 200" "200" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/content/categories")
check "GET /content/categories → 200" "200" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/content/ratings")
check "GET /content/ratings → 200" "200" "$code"

# ─── 5. Auth — unauthenticated ───
echo "[Auth — no token]"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/auth/me")
check "GET /auth/me without token → 401" "401" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/subscription")
check "GET /subscription without token → 401" "401" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/favorites")
check "GET /favorites without token → 401" "401" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/plate")
check "GET /plate without token → 401" "401" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/plate/history")
check "GET /plate/history without token → 401" "401" "$code"

# ─── 6. Auth — bad input ───
echo "[Auth — validation]"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/send-code" \
  -H "Content-Type: application/json" -d '{"email":"not-an-email"}')
check "POST /auth/send-code bad email → 400" "400" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/verify" \
  -H "Content-Type: application/json" -d '{}')
check "POST /auth/verify empty → 400" "400" "$code"

# ─── 7. Admin — no access ───
echo "[Admin — no access]"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/users")
check "GET /admin/users without token → 401" "401" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/payments")
check "GET /admin/payments without token → 401" "401" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/feedback")
check "GET /admin/feedback without token → 401" "401" "$code"

# ─── 8. Write endpoints — no auth ───
echo "[Write — no auth]"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/subscription/payment" \
  -H "Content-Type: application/json" -d '{"amount":100,"paymentDate":"2026-01-01"}')
check "POST /subscription/payment without token → 401" "401" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/feedback" \
  -H "Content-Type: application/json" -d '{"category":"wish","text":"test"}')
check "POST /feedback without token → 401" "401" "$code"

# ─── 9. Rate limit headers ───
echo "[Rate Limit]"
rl_headers=$(curl -sI "$BASE/content/news")
check_contains "Rate limit header present" "x-ratelimit-limit" "$rl_headers"

# ─── 10. 404 handling ───
echo "[404]"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/nonexistent-route")
check "GET /nonexistent → 404" "404" "$code"

# ─── Summary ───
echo ""
echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
