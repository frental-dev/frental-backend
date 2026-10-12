#!/usr/bin/env bash

# ============================================================
# FRENTAL BACKEND - AUTH SMOKE TEST
# ============================================================
#
# Requirements:
#   - bash
#   - curl
#   - jq
#
# Usage:
#   chmod +x test-auth-smoke.sh
#   ./test-auth-smoke.sh
#
# Local:
#   BASE_URL=http://localhost:4000 ./test-auth-smoke.sh
#
# Production:
#   BASE_URL=https://frental-backend.onrender.com ./test-auth-smoke.sh
#
# Optional email OTP test:
#   VERIFY_CODE=123456 BASE_URL=http://localhost:4000 ./test-auth-smoke.sh
#
# Optional Google test:
#   GOOGLE_ID_TOKEN="..." BASE_URL=http://localhost:4000 ./test-auth-smoke.sh
#
# Tests:
#   1. Health
#   2. Signup
#   3. Authenticated /me
#   4. Invalid access token
#   5. Sessions
#   6. Refresh-token rotation
#   7. Old refresh-token rejection
#   8. New refresh-token works
#   9. Resend verification
#  10. Optional email OTP verification
#  11. Login
#  12. Invalid password
#  13. Logout
#  14. Refresh after logout
#  15. Logout-all
#  16. Refresh after logout-all
#  17. Forgot-password request
#  18. Optional Google Sign-In
#
# API version:
#   /api/v1
#
# ============================================================

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
API="${BASE_URL%/}/api/v1"

PASS=0
FAIL=0
SKIP=0

# ------------------------------------------------------------
# Test helpers
# ------------------------------------------------------------

print_header() {
    echo
    echo "============================================================"
    echo "$1"
    echo "============================================================"
}

pass() {
    echo "  [PASS] $1"
    PASS=$((PASS + 1))
}

fail() {
    echo "  [FAIL] $1"
    FAIL=$((FAIL + 1))
}

skip() {
    echo "  [SKIP] $1"
    SKIP=$((SKIP + 1))
}

assert_status() {
    local expected="$1"
    local actual="$2"
    local name="$3"

    if [[ "$actual" == "$expected" ]]; then
        pass "$name (HTTP $actual)"
        return 0
    else
        fail "$name (expected HTTP $expected, got HTTP $actual)"
        return 1
    fi
}

assert_status_any() {
    local actual="$1"
    local name="$2"
    shift 2

    local expected
    for expected in "$@"; do
        if [[ "$actual" == "$expected" ]]; then
            pass "$name (HTTP $actual)"
            return 0
        fi
    done

    fail "$name (unexpected HTTP $actual; expected one of: $*)"
    return 1
}

assert_nonempty() {
    local value="$1"
    local name="$2"

    if [[ -n "$value" && "$value" != "null" ]]; then
        pass "$name"
        return 0
    else
        fail "$name"
        return 1
    fi
}

pretty_response() {
    echo "$1" | jq . 2>/dev/null || echo "$1"
}

# Global response variables:
#   RESPONSE_STATUS
#   RESPONSE_BODY
#
# Usage:
#   request METHOD URL [BODY] [TOKEN]
request() {
    RESPONSE_BODY=""
    RESPONSE_STATUS=""

    local method="$1"
    local url="$2"
    local body="${3:-}"
    local token="${4:-}"

    local tmp
    tmp=$(mktemp)

    local curl_args=(
        -sS
        --connect-timeout 10
        --max-time 30
        -o "$tmp"
        -w "%{http_code}"
        -X "$method"
        "$url"
    )

    if [[ -n "$body" ]]; then
        curl_args+=(
            -H "Content-Type: application/json"
            -d "$body"
        )
    fi

    if [[ -n "$token" ]]; then
        curl_args+=(
            -H "Authorization: Bearer $token"
        )
    fi

    RESPONSE_STATUS=$(curl "${curl_args[@]}" 2>/dev/null)
    local curl_exit=$?

    RESPONSE_BODY=$(cat "$tmp" 2>/dev/null || true)
    rm -f "$tmp"

    if [[ $curl_exit -ne 0 ]]; then
        RESPONSE_STATUS="000"
        RESPONSE_BODY="curl failed with exit code $curl_exit"
    fi
}

# ------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------

print_header "CHECKING DEPENDENCIES"

if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required."
    exit 1
fi
pass "curl available"

if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required."
    exit 1
fi
pass "jq available"

echo
echo "Base URL: $BASE_URL"
echo "API:      $API"

# ------------------------------------------------------------
# Generate unique test account
# ------------------------------------------------------------

TIMESTAMP=$(date +%s)

TEST_NAME="Auth Smoke ${TIMESTAMP}"
TEST_PHONE="071${TIMESTAMP: -7}"
TEST_EMAIL="victorpeter0540@gmail.com"
TEST_PASSWORD="TestPass123!"

echo
echo "Test account:"
echo "  Name:     $TEST_NAME"
echo "  Phone:    $TEST_PHONE"
echo "  Email:    $TEST_EMAIL"
echo "  Password: ********"

# ------------------------------------------------------------
# 1. Health
# ------------------------------------------------------------

print_header "1. HEALTH CHECK"

request GET "${BASE_URL%/}/health"

assert_status "200" "$RESPONSE_STATUS" "API health endpoint"

if [[ "$RESPONSE_STATUS" == "200" ]]; then
    echo "  Response: $RESPONSE_BODY"
else
    echo "  Response:"
    pretty_response "$RESPONSE_BODY"
    echo
    echo "API is not healthy/reachable. Stopping smoke test."
    exit 1
fi

# ------------------------------------------------------------
# 2. Signup
# ------------------------------------------------------------

print_header "2. SIGNUP"

SIGNUP_BODY=$(jq -n \
    --arg name "$TEST_NAME" \
    --arg phone "$TEST_PHONE" \
    --arg email "$TEST_EMAIL" \
    --arg password "$TEST_PASSWORD" \
    '{
        name: $name,
        phone: $phone,
        email: $email,
        password: $password
    }')

request POST "${API}/agents/signup" "$SIGNUP_BODY"

assert_status "201" "$RESPONSE_STATUS" "Agent signup"

if [[ "$RESPONSE_STATUS" != "201" ]]; then
    echo "  Response:"
    pretty_response "$RESPONSE_BODY"
    echo
    echo "Signup failed. Stopping auth smoke test."
    exit 1
fi

ACCESS_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.accessToken // .token // empty')
REFRESH_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.refreshToken // empty')

assert_nonempty "$ACCESS_TOKEN" "Signup returned access token"
assert_nonempty "$REFRESH_TOKEN" "Signup returned refresh token"

# ------------------------------------------------------------
# 3. Authenticated /me
# ------------------------------------------------------------

print_header "3. AUTHENTICATED /ME"

request GET "${API}/agents/me" "" "$ACCESS_TOKEN"

assert_status "200" "$RESPONSE_STATUS" "GET /agents/me with valid token"

if [[ "$RESPONSE_STATUS" == "200" ]]; then
    AGENT_ID=$(echo "$RESPONSE_BODY" | jq -r '.agent.id // empty')
    AGENT_EMAIL=$(echo "$RESPONSE_BODY" | jq -r '.agent.email // empty')

    assert_nonempty "$AGENT_ID" "Authenticated response contains agent ID"
    assert_nonempty "$AGENT_EMAIL" "Authenticated response contains agent email"
fi

# ------------------------------------------------------------
# 4. Invalid access token
# ------------------------------------------------------------

print_header "4. INVALID ACCESS TOKEN"

request GET "${API}/agents/me" "" "this-is-not-a-valid-jwt"

assert_status "401" "$RESPONSE_STATUS" "Invalid access token rejected"

# ------------------------------------------------------------
# 5. Sessions
# ------------------------------------------------------------

print_header "5. SESSION MANAGEMENT"

request GET "${API}/agents/me/sessions" "" "$ACCESS_TOKEN"

assert_status "200" "$RESPONSE_STATUS" "List authenticated sessions"

if [[ "$RESPONSE_STATUS" == "200" ]]; then
    SESSION_COUNT=$(echo "$RESPONSE_BODY" | jq '.sessions | length' 2>/dev/null || echo "0")

    if [[ "$SESSION_COUNT" =~ ^[0-9]+$ && "$SESSION_COUNT" -ge 1 ]]; then
        pass "At least one active session exists"
        echo "  Active sessions: $SESSION_COUNT"
    else
        fail "Expected at least one active session"
    fi
fi

# ------------------------------------------------------------
# 6. Refresh-token rotation
# ------------------------------------------------------------

print_header "6. REFRESH TOKEN ROTATION"

OLD_REFRESH_TOKEN="$REFRESH_TOKEN"

request POST "${API}/agents/refresh" \
    "{\"refreshToken\":\"$REFRESH_TOKEN\"}"

assert_status "200" "$RESPONSE_STATUS" \
    "Refresh access token"

NEW_ACCESS_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.accessToken // empty')
NEW_REFRESH_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.refreshToken // empty')

assert_nonempty "$NEW_ACCESS_TOKEN" \
    "Refresh returned new access token"

assert_nonempty "$NEW_REFRESH_TOKEN" \
    "Refresh returned new refresh token"

if [[ "$NEW_REFRESH_TOKEN" != "$OLD_REFRESH_TOKEN" ]]; then
    pass "Refresh token was rotated"
else
    fail "Refresh token was not rotated"
fi

ACCESS_TOKEN="$NEW_ACCESS_TOKEN"
REFRESH_TOKEN="$NEW_REFRESH_TOKEN"

# ------------------------------------------------------------
# 7. Old refresh-token reuse
# ------------------------------------------------------------

print_header "7. OLD REFRESH TOKEN REUSE"

request POST "${API}/agents/refresh" \
    "{\"refreshToken\":\"$OLD_REFRESH_TOKEN\"}"

assert_status_any "$RESPONSE_STATUS" \
    "Old refresh token reuse rejected" \
    400 401 403

echo "  Response:"
pretty_response "$RESPONSE_BODY"

# ------------------------------------------------------------
# 8. New refresh-token works
# ------------------------------------------------------------

print_header "8. NEW REFRESH TOKEN"

NEW_REFRESH_BODY=$(jq -n \
    --arg refreshToken "$REFRESH_TOKEN" \
    '{refreshToken: $refreshToken}')

request POST "${API}/agents/refresh" "$NEW_REFRESH_BODY"

assert_status "200" "$RESPONSE_STATUS" "New refresh token works"

if [[ "$RESPONSE_STATUS" == "200" ]]; then
    ACCESS_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.accessToken // empty')
    REFRESH_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.refreshToken // empty')

    assert_nonempty "$ACCESS_TOKEN" "New access token returned"
    assert_nonempty "$REFRESH_TOKEN" "New refresh token returned"
fi

# ------------------------------------------------------------
# 9. Resend verification
# ------------------------------------------------------------

print_header "9. RESEND EMAIL VERIFICATION"

request POST "${API}/agents/me/resend-verification" "" "$ACCESS_TOKEN"

assert_status "200" "$RESPONSE_STATUS" "Resend verification request"

echo "  Response:"
pretty_response "$RESPONSE_BODY"

# ------------------------------------------------------------
# 10. Optional email OTP verification
# ------------------------------------------------------------

print_header "10. EMAIL OTP VERIFICATION"

if [[ -n "${VERIFY_CODE:-}" ]]; then

    VERIFY_BODY=$(jq -n \
        --arg code "$VERIFY_CODE" \
        '{code: $code}')

    request POST "${API}/agents/me/verify-email" "$VERIFY_BODY" "$ACCESS_TOKEN"

    assert_status "200" "$RESPONSE_STATUS" "Verify email with supplied OTP"

    echo "  Response:"
    pretty_response "$RESPONSE_BODY"

else
    skip "Email OTP verification (set VERIFY_CODE=123456 to test)"
fi

# ------------------------------------------------------------
# 11. Login
# ------------------------------------------------------------

print_header "11. LOGIN"

LOGIN_BODY=$(jq -n \
    --arg email "$TEST_EMAIL" \
    --arg password "$TEST_PASSWORD" \
    '{
        email: $email,
        password: $password
    }')

request POST "${API}/agents/login" "$LOGIN_BODY"

assert_status "200" "$RESPONSE_STATUS" "Login with valid credentials"

if [[ "$RESPONSE_STATUS" == "200" ]]; then
    ACCESS_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.accessToken // .token // empty')
    REFRESH_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.refreshToken // empty')

    assert_nonempty "$ACCESS_TOKEN" "Login returned access token"
    assert_nonempty "$REFRESH_TOKEN" "Login returned refresh token"
else
    echo "  Response:"
    pretty_response "$RESPONSE_BODY"
fi

# ------------------------------------------------------------
# 12. Invalid password
# ------------------------------------------------------------

print_header "12. INVALID PASSWORD"

BAD_LOGIN_BODY=$(jq -n \
    --arg email "$TEST_EMAIL" \
    '{
        email: $email,
        password: "DefinitelyWrongPassword!"
    }')

request POST "${API}/agents/login" "$BAD_LOGIN_BODY"

assert_status_any \
    "$RESPONSE_STATUS" \
    "Invalid password rejected" \
    "400" "401"

# ------------------------------------------------------------
# 13. Logout
# ------------------------------------------------------------

print_header "13. LOGOUT"

LOGOUT_BODY=$(jq -n \
    --arg refreshToken "$REFRESH_TOKEN" \
    '{refreshToken: $refreshToken}')

request POST "${API}/agents/logout" "$LOGOUT_BODY"

assert_status "200" "$RESPONSE_STATUS" "Logout"

# ------------------------------------------------------------
# 14. Refresh after logout
# ------------------------------------------------------------

print_header "14. REFRESH AFTER LOGOUT"

request POST "${API}/agents/refresh" "$LOGOUT_BODY"

assert_status_any \
    "$RESPONSE_STATUS" \
    "Refresh token rejected after logout" \
    "400" "401"

# ------------------------------------------------------------
# 15. Login again before logout-all
# ------------------------------------------------------------

print_header "15. LOGIN AGAIN"

request POST "${API}/agents/login" "$LOGIN_BODY"

assert_status "200" "$RESPONSE_STATUS" "Login after logout"

if [[ "$RESPONSE_STATUS" == "200" ]]; then
    ACCESS_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.accessToken // .token // empty')
    REFRESH_TOKEN=$(echo "$RESPONSE_BODY" | jq -r '.refreshToken // empty')

    assert_nonempty "$ACCESS_TOKEN" "Re-login returned access token"
    assert_nonempty "$REFRESH_TOKEN" "Re-login returned refresh token"
fi

# ------------------------------------------------------------
# 16. Logout-all
# ------------------------------------------------------------

print_header "16. LOGOUT ALL"

request POST "${API}/agents/logout-all" "" "$ACCESS_TOKEN"

assert_status "200" "$RESPONSE_STATUS" "Logout all sessions"

# ------------------------------------------------------------
# 17. Refresh after logout-all
# ------------------------------------------------------------

print_header "17. REFRESH AFTER LOGOUT-ALL"

FINAL_REFRESH_BODY=$(jq -n \
    --arg refreshToken "$REFRESH_TOKEN" \
    '{refreshToken: $refreshToken}')

request POST "${API}/agents/refresh" "$FINAL_REFRESH_BODY"

assert_status_any \
    "$RESPONSE_STATUS" \
    "Refresh rejected after logout-all" \
    "400" "401"

# ------------------------------------------------------------
# 18. Forgot password
# ------------------------------------------------------------

print_header "18. FORGOT PASSWORD"

FORGOT_BODY=$(jq -n \
    --arg email "$TEST_EMAIL" \
    '{email: $email}')

request POST "${API}/agents/forgot-password" "$FORGOT_BODY"

assert_status "200" "$RESPONSE_STATUS" "Forgot-password request"

echo "  Response:"
pretty_response "$RESPONSE_BODY"

# ------------------------------------------------------------
# 19. Optional Google Sign-In
# ------------------------------------------------------------

print_header "19. GOOGLE SIGN-IN"

if [[ -n "${GOOGLE_ID_TOKEN:-}" ]]; then

    GOOGLE_BODY=$(jq -n \
        --arg idToken "$GOOGLE_ID_TOKEN" \
        '{idToken: $idToken}')

    request POST "${API}/agents/google" "$GOOGLE_BODY"

    assert_status_any \
        "$RESPONSE_STATUS" \
        "Google authentication request" \
        "200" "201"

    echo "  Response:"
    pretty_response "$RESPONSE_BODY"

else
    skip "Google Sign-In (set GOOGLE_ID_TOKEN to test)"
fi

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------

print_header "AUTH SMOKE TEST SUMMARY"

echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Skipped: $SKIP"
echo

if [[ "$FAIL" -eq 0 ]]; then
    echo "============================================================"
    echo "✅ AUTH SMOKE TEST PASSED"
    echo "============================================================"
    echo
    echo "API version tested:"
    echo "  $API"
    echo
    echo "Core flows checked:"
    echo "  ✓ Health"
    echo "  ✓ Signup"
    echo "  ✓ JWT authentication"
    echo "  ✓ Invalid-token rejection"
    echo "  ✓ Sessions"
    echo "  ✓ Refresh-token rotation"
    echo "  ✓ Refresh-token reuse protection"
    echo "  ✓ Resend verification"
    echo "  ✓ Login"
    echo "  ✓ Invalid password"
    echo "  ✓ Logout"
    echo "  ✓ Logout-all"
    echo "  ✓ Forgot password"
    echo
    echo "Optional:"
    echo "  Email OTP verification: ${VERIFY_CODE:+enabled}${VERIFY_CODE:-not supplied}"
    echo "  Google Sign-In:          ${GOOGLE_ID_TOKEN:+enabled}${GOOGLE_ID_TOKEN:-not supplied}"
    exit 0
else
    echo "============================================================"
    echo "❌ AUTH SMOKE TEST FAILED"
    echo "============================================================"
    echo
    echo "Review the failed checks above."
    exit 1
fi
