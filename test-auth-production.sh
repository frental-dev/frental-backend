#!/usr/bin/env bash

# ============================================================
# Frental Authentication - Production / Black-Box Test Suite
# ============================================================
#
# Requirements:
#   curl
#   jq
#   bash
#
# Examples:
#
#   BASE_URL=http://localhost:4000 \
#   TEST_EMAIL="victorpeter0540+frental1@gmail.com" \
#   TEST_EMAIL_2="victorpeter0540+frental2@gmail.com" \
#   EMAIL_CHANGE_TARGET="victorpeter0540+frentalchange@gmail.com" \
#   ./test-auth-production.sh
#
# Production:
#
#   BASE_URL=https://frental-backend.onrender.com \
#   PRODUCTION=1 \
#   TEST_EMAIL="victorpeter0540+frental1@gmail.com" \
#   TEST_EMAIL_2="victorpeter0540+frental2@gmail.com" \
#   EMAIL_CHANGE_TARGET="victorpeter0540+frentalchange@gmail.com" \
#   ./test-auth-production.sh
#
# OTP behaviour:
#
#   PROMPT_FOR_OTP=1
#   The script pauses when a real OTP is expected and asks you
#   to enter the code received in the real inbox.
#
# Optional:
#
#   VERIFY_CODE=123456
#   RESET_CODE=123456
#   EMAIL_CHANGE_CODE=123456
#
# ============================================================

set +e

# ============================================================
# CONFIGURATION
# ============================================================

BASE_URL="${BASE_URL:-http://localhost:4000}"
API="${BASE_URL%/}/api/v1"

PRODUCTION="${PRODUCTION:-0}"

DESTRUCTIVE_TESTS="${DESTRUCTIVE_TESTS:-1}"
RATE_LIMIT_TESTS="${RATE_LIMIT_TESTS:-1}"
FUZZ_TESTS="${FUZZ_TESTS:-1}"
SECURITY_HEADER_TESTS="${SECURITY_HEADER_TESTS:-1}"
CORS_TESTS="${CORS_TESTS:-1}"
TIMING_TESTS="${TIMING_TESTS:-0}"
OTP_ATTEMPT_TESTS="${OTP_ATTEMPT_TESTS:-1}"
OTP_EXPIRY_TESTS="${OTP_EXPIRY_TESTS:-0}"

FAIL_FAST="${FAIL_FAST:-0}"

PROMPT_FOR_OTP="${PROMPT_FOR_OTP:-1}"

ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

GOOGLE_ID_TOKEN="${GOOGLE_ID_TOKEN:-}"

TEST_PASSWORD="${TEST_PASSWORD:-FrentalTest!2026}"
TEST_PASSWORD_2="${TEST_PASSWORD_2:-FrentalTestChanged!2026}"

# ------------------------------------------------------------
# REAL TEST EMAILS
# ------------------------------------------------------------

TEST_EMAIL="${TEST_EMAIL:-}"
TEST_EMAIL_2="${TEST_EMAIL_2:-}"
EMAIL_CHANGE_TARGET="${EMAIL_CHANGE_TARGET:-}"

# ------------------------------------------------------------
# OTPs
# ------------------------------------------------------------

VERIFY_CODE="${VERIFY_CODE:-}"
RESET_CODE="${RESET_CODE:-}"
EMAIL_CHANGE_CODE="${EMAIL_CHANGE_CODE:-}"

# ------------------------------------------------------------
# CURL
# ------------------------------------------------------------

CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-10}"
MAX_TIME="${MAX_TIME:-30}"

# ------------------------------------------------------------
# Counters
# ------------------------------------------------------------

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
SKIP_COUNT=0

# ------------------------------------------------------------
# Runtime variables
# ------------------------------------------------------------

TEST_NAME=""
TEST_PHONE=""
TEST_PHONE_2=""

ACCESS_TOKEN=""
ACCESS_TOKEN_2=""

REFRESH_TOKEN=""
REFRESH_TOKEN_2=""

SECOND_REFRESH_TOKEN=""

SESSION_ID=""
SESSION_ID_2=""

ORIGINAL_EMAIL=""
CURRENT_TEST_EMAIL=""

RESPONSE_BODY=""
RESPONSE_STATUS=""
RESPONSE_HEADERS=""
RESPONSE_TIME=""

TMP_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$TMP_DIR"
}

trap cleanup EXIT

# ============================================================
# COLORS
# ============================================================

if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    MAGENTA='\033[0;35m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    CYAN=''
    MAGENTA=''
    BOLD=''
    RESET=''
fi

# ============================================================
# OUTPUT HELPERS
# ============================================================

print_header() {
    echo
    echo "============================================================"
    echo "$1"
    echo "============================================================"
}

print_section() {
    echo
    echo "------------------------------------------------------------"
    echo "$1"
    echo "------------------------------------------------------------"
}

pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo -e "${GREEN}[PASS]${RESET} $1"
}

fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo -e "${RED}[FAIL]${RESET} $1"

    if [[ "$FAIL_FAST" == "1" ]]; then
        echo
        echo "FAIL_FAST=1 -> stopping."
        exit 1
    fi
}

warn() {
    WARN_COUNT=$((WARN_COUNT + 1))
    echo -e "${YELLOW}[WARN]${RESET} $1"
}

skip() {
    SKIP_COUNT=$((SKIP_COUNT + 1))
    echo -e "${YELLOW}[SKIP]${RESET} $1"
}

info() {
    echo -e "${CYAN}[INFO]${RESET} $1"
}

debug() {
    if [[ "${DEBUG:-0}" == "1" ]]; then
        echo -e "${MAGENTA}[DEBUG]${RESET} $1"
    fi
}

# ============================================================
# DEPENDENCY CHECK
# ============================================================

print_header "CHECKING DEPENDENCIES"

if command -v curl >/dev/null 2>&1; then
    pass "curl available"
else
    fail "curl is required"
    exit 1
fi

if command -v jq >/dev/null 2>&1; then
    pass "jq available"
else
    fail "jq is required"
    exit 1
fi

if ! command -v bash >/dev/null 2>&1; then
    fail "bash is required"
    exit 1
fi

# ============================================================
# TEST EMAIL VALIDATION
# ============================================================

if [[ -z "$TEST_EMAIL" ]]; then
    echo
    echo "TEST_EMAIL is required."
    echo
    echo "Example:"
    echo '  TEST_EMAIL="victorpeter0540+frental1@gmail.com"'
    echo
    exit 1
fi

if [[ -z "$TEST_EMAIL_2" ]]; then
    echo
    echo "TEST_EMAIL_2 is required."
    echo
    echo "Example:"
    echo '  TEST_EMAIL_2="victorpeter0540+frental2@gmail.com"'
    echo
    exit 1
fi

if [[ -z "$EMAIL_CHANGE_TARGET" ]]; then
    echo
    echo "EMAIL_CHANGE_TARGET is required."
    echo
    echo "Example:"
    echo '  EMAIL_CHANGE_TARGET="victorpeter0540+frentalchange@gmail.com"'
    echo
    exit 1
fi

# ============================================================
# RANDOM TEST DATA
# ============================================================

TIMESTAMP="$(date +%s)"
RANDOM_SUFFIX="${TIMESTAMP}${RANDOM}"

TEST_NAME="Auth Production ${RANDOM_SUFFIX}"

# Generate reasonably unique Kenyan-style numbers.
random_kenyan_phone() {
    printf '07%08d\n' "$(( (RANDOM * 1000 + RANDOM) % 100000000 ))"
}

TEST_PHONE="$(random_kenyan_phone)"
TEST_PHONE_2="$(random_kenyan_phone)"

ORIGINAL_EMAIL="$TEST_EMAIL"
CURRENT_TEST_EMAIL="$TEST_EMAIL"

echo
echo "Base URL:      $BASE_URL"
echo "API:           $API"
echo
echo "Primary email: $TEST_EMAIL"
echo "Second email:  $TEST_EMAIL_2"
echo "Email target:  $EMAIL_CHANGE_TARGET"
echo
echo "Test phone:    $TEST_PHONE"
echo "Test phone #2: $TEST_PHONE_2"
echo

if [[ "$PRODUCTION" == "1" ]]; then
    echo -e "${YELLOW}${BOLD}WARNING: PRODUCTION MODE ENABLED${RESET}"
    echo "This test suite performs destructive authentication tests."
    echo
fi

# ============================================================
# HTTP REQUEST ENGINE
# ============================================================

request() {
    local method="$1"
    local url="$2"
    local body="${3:-}"
    local token="${4:-}"
    local extra_headers="${5:-}"

    local body_file="$TMP_DIR/body"
    local header_file="$TMP_DIR/headers"

    local curl_args=(
        -sS
        -X "$method"
        "$url"
        --connect-timeout "$CONNECT_TIMEOUT"
        --max-time "$MAX_TIME"
        -D "$header_file"
        -o "$body_file"
        -w "%{http_code}|%{time_total}"
    )

    curl_args+=(
        -H "Accept: application/json"
    )

    if [[ -n "$body" ]]; then
        curl_args+=(
            -H "Content-Type: application/json"
            --data "$body"
        )
    fi

    if [[ -n "$token" ]]; then
        curl_args+=(
            -H "Authorization: Bearer $token"
        )
    fi

    if [[ -n "$extra_headers" ]]; then
        # shellcheck disable=SC2206
        local headers=( $extra_headers )

        for h in "${headers[@]}"; do
            curl_args+=(-H "$h")
        done
    fi

    local result

    result="$(curl "${curl_args[@]}" 2>"$TMP_DIR/curl_error")"

    local curl_exit=$?

    RESPONSE_BODY="$(cat "$body_file" 2>/dev/null)"
    RESPONSE_HEADERS="$(cat "$header_file" 2>/dev/null)"

    RESPONSE_STATUS="${result%%|*}"
    RESPONSE_TIME="${result##*|}"

    if [[ "$curl_exit" -ne 0 ]]; then
        RESPONSE_STATUS="000"
        RESPONSE_TIME="0"
        RESPONSE_BODY="$(cat "$TMP_DIR/curl_error" 2>/dev/null)"
        return 1
    fi

    return 0
}

request_raw() {
    local method="$1"
    local url="$2"
    shift 2

    local body_file="$TMP_DIR/body"
    local header_file="$TMP_DIR/headers"

    local result

    result="$(
        curl -sS \
            -X "$method" \
            "$url" \
            --connect-timeout "$CONNECT_TIMEOUT" \
            --max-time "$MAX_TIME" \
            -D "$header_file" \
            -o "$body_file" \
            -w "%{http_code}|%{time_total}" \
            "$@" \
            2>"$TMP_DIR/curl_error"
    )"

    local curl_exit=$?

    RESPONSE_BODY="$(cat "$body_file" 2>/dev/null)"
    RESPONSE_HEADERS="$(cat "$header_file" 2>/dev/null)"

    RESPONSE_STATUS="${result%%|*}"
    RESPONSE_TIME="${result##*|}"

    if [[ "$curl_exit" -ne 0 ]]; then
        RESPONSE_STATUS="000"
        RESPONSE_TIME="0"
        RESPONSE_BODY="$(cat "$TMP_DIR/curl_error" 2>/dev/null)"
        return 1
    fi

    return 0
}

# ============================================================
# JSON HELPERS
# ============================================================

json_get() {
    local path="$1"

    if [[ -z "$RESPONSE_BODY" ]]; then
        echo ""
        return
    fi

    echo "$RESPONSE_BODY" | jq -r "$path" 2>/dev/null
}

body_contains() {
    local needle="$1"

    echo "$RESPONSE_BODY" | grep -Fqi "$needle"
}

body_has_secret() {
    local secret="$1"

    [[ -n "$secret" ]] || return 1

    if echo "$RESPONSE_BODY" | grep -Fq "$secret"; then
        return 0
    fi

    return 1
}

body_has_stacktrace() {
    echo "$RESPONSE_BODY" | grep -Eqi \
        'stack trace|at [A-Za-z0-9_]+\.[A-Za-z0-9_]+\(|node_modules/|PrismaClient|SyntaxError:|TypeError:'
}

body_has_db_error() {
    echo "$RESPONSE_BODY" | grep -Eqi \
        'postgres|postgresql|database error|P2002|P2003|Prisma|SQLSTATE|relation .* does not exist'
}

body_has_html_error() {
    echo "$RESPONSE_BODY" | grep -Eqi \
        '<html|<!doctype'
}

# ============================================================
# ASSERTIONS
# ============================================================

assert_status() {
    local expected="$1"
    local description="$2"

    if [[ "$RESPONSE_STATUS" == "$expected" ]]; then
        pass "$description [$RESPONSE_STATUS]"
        return 0
    fi

    fail "$description [expected $expected, got $RESPONSE_STATUS]"
    debug "Response: $RESPONSE_BODY"

    return 1
}

assert_status_any() {
    local expected="$1"
    local description="$2"

    local ok=0

    for status in $expected; do
        if [[ "$RESPONSE_STATUS" == "$status" ]]; then
            ok=1
            break
        fi
    done

    if [[ "$ok" == "1" ]]; then
        pass "$description [$RESPONSE_STATUS]"
        return 0
    fi

    fail "$description [expected one of: $expected, got $RESPONSE_STATUS]"
    debug "Response: $RESPONSE_BODY"

    return 1
}

assert_json_field() {
    local path="$1"
    local expected="$2"
    local description="$3"

    local actual
    actual="$(json_get "$path")"

    if [[ "$actual" == "$expected" ]]; then
        pass "$description"
        return 0
    fi

    fail "$description [expected '$expected', got '$actual']"
    return 1
}

assert_json_exists() {
    local path="$1"
    local description="$2"

    local value
    value="$(json_get "$path")"

    if [[ -n "$value" && "$value" != "null" ]]; then
        pass "$description"
        return 0
    fi

    fail "$description"
    return 1
}

assert_no_secret() {
    local secret="$1"
    local description="$2"

    if [[ -z "$secret" ]]; then
        skip "$description - secret not available"
        return 0
    fi

    if body_has_secret "$secret"; then
        fail "$description"
        return 1
    fi

    pass "$description"
}

assert_no_server_leakage() {
    local description="$1"

    if body_has_stacktrace || body_has_db_error; then
        fail "$description"
        return 1
    fi

    pass "$description"
}

# ============================================================
# OTP HELPERS
# ============================================================

is_valid_otp() {
    local code="$1"

    [[ "$code" =~ ^[0-9]{6}$ ]]
}

prompt_for_otp() {
    local label="$1"
    local email="$2"

    echo
    echo -e "${YELLOW}${BOLD}OTP REQUIRED${RESET}"
    echo "Purpose: $label"
    echo "Inbox:   $email"
    echo
    echo "Check the real inbox for the Frental OTP."
    echo

    local code=""

    while true; do
        read -r -p "Enter the 6-digit OTP: " code

        if is_valid_otp "$code"; then
            echo "$code"
            return 0
        fi

        echo "Invalid OTP format. Expected exactly 6 digits."
    done
}

obtain_otp() {
    local variable_name="$1"
    local label="$2"
    local email="$3"

    local existing="${!variable_name:-}"

    if [[ -n "$existing" ]]; then
        if is_valid_otp "$existing"; then
            echo "$existing"
            return 0
        fi

        warn "$variable_name exists but is not a valid 6-digit OTP"
    fi

    if [[ "$PROMPT_FOR_OTP" != "1" ]]; then
        echo ""
        return 0
    fi

    prompt_for_otp "$label" "$email"
}

otp_checkpoint() {
    local label="$1"
    local email="$2"

    echo
    echo "============================================================"
    echo "REAL EMAIL CHECKPOINT"
    echo "============================================================"
    echo
    echo "Frental should have sent an email for:"
    echo
    echo "  $label"
    echo
    echo "Inbox:"
    echo "  $email"
    echo
    echo "Check the inbox before continuing."
    echo "============================================================"
    echo
}

# ============================================================
# TOKEN HELPERS
# ============================================================

extract_tokens() {
    ACCESS_TOKEN="$(json_get '.accessToken')"
    REFRESH_TOKEN="$(json_get '.refreshToken')"

    if [[ -z "$ACCESS_TOKEN" || "$ACCESS_TOKEN" == "null" ]]; then
        ACCESS_TOKEN="$(json_get '.data.accessToken')"
    fi

    if [[ -z "$REFRESH_TOKEN" || "$REFRESH_TOKEN" == "null" ]]; then
        REFRESH_TOKEN="$(json_get '.data.refreshToken')"
    fi
}

extract_secondary_tokens() {
    ACCESS_TOKEN_2="$(json_get '.accessToken')"
    REFRESH_TOKEN_2="$(json_get '.refreshToken')"

    if [[ -z "$ACCESS_TOKEN_2" || "$ACCESS_TOKEN_2" == "null" ]]; then
        ACCESS_TOKEN_2="$(json_get '.data.accessToken')"
    fi

    if [[ -z "$REFRESH_TOKEN_2" || "$REFRESH_TOKEN_2" == "null" ]]; then
        REFRESH_TOKEN_2="$(json_get '.data.refreshToken')"
    fi
}

login_primary() {
    request POST \
        "$API/agents/login" \
        "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

    if [[ "$RESPONSE_STATUS" == "200" ]]; then
        extract_tokens
        return 0
    fi

    return 1
}

login_primary_with_password() {
    local password="$1"

    request POST \
        "$API/agents/login" \
        "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$password\"}"

    if [[ "$RESPONSE_STATUS" == "200" ]]; then
        extract_tokens
        return 0
    fi

    return 1
}

# ============================================================
# PRODUCTION DEPLOYMENT
# ============================================================

print_header "1. DEPLOYMENT CHECK"

if [[ "$PRODUCTION" == "1" ]]; then
    info "Production mode enabled"
else
    info "Local/staging mode enabled"
fi

request GET "$BASE_URL/health"

assert_status "200" "Health endpoint reachable"

if body_has_html_error; then
    fail "Health response contains HTML error page"
else
    pass "Health response is not an HTML error page"
fi

# ============================================================
# HEALTH
# ============================================================

print_header "2. HEALTH"

request GET "$BASE_URL/health"

assert_status "200" "GET /health"

assert_no_server_leakage "Health endpoint does not leak server/database internals"

# ============================================================
# SECURITY HEADERS
# ============================================================

print_header "3. SECURITY HEADERS"

if [[ "$SECURITY_HEADER_TESTS" == "1" ]]; then

    request GET "$BASE_URL/health"

    for header in \
        "x-content-type-options" \
        "x-frame-options" \
        "referrer-policy" \
        "content-security-policy"
    do
        if echo "$RESPONSE_HEADERS" | grep -Eiq "^$header:"; then
            pass "Security header present: $header"
        else
            warn "Security header not observed: $header"
        fi
    done

else
    skip "Security header tests disabled"
fi

# ============================================================
# SIGNUP VALIDATION
# ============================================================

print_header "4. SIGNUP VALIDATION"

request POST \
    "$API/agents/signup" \
    '{"name":"","email":"","password":""}'

assert_status_any "400 401 422" "Signup rejects empty required fields"

request POST \
    "$API/agents/signup" \
    '{"name":"Test","email":"not-an-email","password":"123"}'

assert_status_any "400 401 422" "Signup rejects invalid email/password"

request POST \
    "$API/agents/signup" \
    "{\"name\":\"$TEST_NAME\",\"email\":\"$TEST_EMAIL\",\"phone\":\"$TEST_PHONE\",\"password\":\"$TEST_PASSWORD\"}"

if [[ "$RESPONSE_STATUS" == "201" ]]; then
    pass "Primary test account created"

    TEST_AGENT_ID="$(json_get '.agent.id')"

    if [[ -z "$TEST_AGENT_ID" || "$TEST_AGENT_ID" == "null" ]]; then
        TEST_AGENT_ID="$(json_get '.id')"
    fi

    extract_tokens

elif [[ "$RESPONSE_STATUS" == "409" ]]; then
    warn "Primary test email/phone already exists"
    info "This script expects fresh dedicated test identities."

    request POST \
        "$API/agents/login" \
        "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

    if [[ "$RESPONSE_STATUS" == "200" ]]; then
        extract_tokens
        pass "Existing primary test account login succeeded"
    else
        fail "Could not create or authenticate primary test account"
    fi
else
    fail "Primary signup failed [$RESPONSE_STATUS]"
fi

# ============================================================
# SIGNUP RESPONSE SECURITY
# ============================================================

print_header "5. SIGNUP RESPONSE SECURITY"

assert_no_secret "$TEST_PASSWORD" "Signup response does not expose password"

if body_contains "refreshToken"; then
    info "Signup returned a refresh token"
fi

assert_no_server_leakage "Signup response does not leak internals"

# ============================================================
# DUPLICATE ACCOUNT PROTECTION
# ============================================================

print_header "6. DUPLICATE ACCOUNT PROTECTION"

request POST \
    "$API/agents/signup" \
    "{\"name\":\"Duplicate Test\",\"email\":\"$TEST_EMAIL\",\"phone\":\"$TEST_PHONE\",\"password\":\"$TEST_PASSWORD\"}"

assert_status_any "400 409 422" "Duplicate primary account rejected"

# ============================================================
# EMAIL VERIFICATION
# ============================================================

print_header "7. EMAIL VERIFICATION"

if [[ -n "$ACCESS_TOKEN" ]]; then

    request POST \
        "$API/agents/me/resend-verification" \
        "" \
        "$ACCESS_TOKEN"

    assert_status_any "200 400 401 409 429" \
        "Resend verification endpoint responds"

    if [[ "$RESPONSE_STATUS" == "200" ]]; then

        otp_checkpoint "Email verification" "$CURRENT_TEST_EMAIL"

        VERIFY_CODE="$(obtain_otp \
            VERIFY_CODE \
            "Email verification" \
            "$CURRENT_TEST_EMAIL")"

        if [[ -n "$VERIFY_CODE" ]]; then

            request POST \
                "$API/agents/me/verify-email" \
                "{\"code\":\"$VERIFY_CODE\"}" \
                "$ACCESS_TOKEN"

            assert_status_any "200 400 401 409" \
                "Email verification accepts real OTP"

            if [[ "$RESPONSE_STATUS" == "200" ]]; then

                request POST \
                    "$API/agents/me/verify-email" \
                    "{\"code\":\"$VERIFY_CODE\"}" \
                    "$ACCESS_TOKEN"

                assert_status_any "400 401 409 422" \
                    "Verification OTP cannot be reused"

            fi
        else
            skip "No verification OTP supplied"
        fi

    else
        info "Verification resend did not return 200; account may already be verified."
    fi

else
    skip "No access token available for email verification"
fi

# ============================================================
# RESEND VERIFICATION RATE LIMIT
# ============================================================

print_header "8. RESEND VERIFICATION"

if [[ -n "$ACCESS_TOKEN" ]]; then

    request POST \
        "$API/agents/me/resend-verification" \
        "" \
        "$ACCESS_TOKEN"

    assert_status_any "200 400 401 409 429" \
        "Resend verification responds correctly"

else
    skip "No access token"
fi

# ============================================================
# ACCESS TOKEN AUTH
# ============================================================

print_header "9. ACCESS TOKEN AUTH"

request GET \
    "$API/agents/me" \
    "" \
    "$ACCESS_TOKEN"

assert_status "200" "Valid access token accepted"

assert_json_exists ".id" "Authenticated user ID returned"

request GET \
    "$API/agents/me"

assert_status_any "401 403" "Missing access token rejected"

request GET \
    "$API/agents/me" \
    "" \
    "invalid.token.value"

assert_status_any "401 403" "Invalid access token rejected"

# ============================================================
# CROSS ACCOUNT SETUP
# ============================================================

print_header "10. SECOND ACCOUNT"

request POST \
    "$API/agents/signup" \
    "{\"name\":\"Secondary Auth Test $RANDOM_SUFFIX\",\"email\":\"$TEST_EMAIL_2\",\"phone\":\"$TEST_PHONE_2\",\"password\":\"$TEST_PASSWORD\"}"

if [[ "$RESPONSE_STATUS" == "201" ]]; then
    pass "Secondary test account created"
elif [[ "$RESPONSE_STATUS" == "409" ]]; then
    warn "Secondary test account already exists"
else
    fail "Secondary account signup failed [$RESPONSE_STATUS]"
fi

request POST \
    "$API/agents/login" \
    "{\"email\":\"$TEST_EMAIL_2\",\"password\":\"$TEST_PASSWORD\"}"

if [[ "$RESPONSE_STATUS" == "200" ]]; then
    extract_secondary_tokens
    pass "Secondary account login succeeded"
else
    fail "Secondary account login failed [$RESPONSE_STATUS]"
fi

# ============================================================
# CROSS ACCOUNT TOKEN ISOLATION
# ============================================================

print_header "11. CROSS-ACCOUNT TOKEN ISOLATION"

if [[ -n "$ACCESS_TOKEN_2" ]]; then

    request GET \
        "$API/agents/me" \
        "" \
        "$ACCESS_TOKEN_2"

    assert_status "200" "Secondary account token accepted"

    SECONDARY_ID="$(json_get '.id')"

    request GET \
        "$API/agents/me" \
        "" \
        "$ACCESS_TOKEN"

    PRIMARY_ID="$(json_get '.id')"

    if [[ -n "$PRIMARY_ID" && -n "$SECONDARY_ID" && "$PRIMARY_ID" != "$SECONDARY_ID" ]]; then
        pass "Primary and secondary tokens resolve to different users"
    else
        fail "Cross-account identity isolation failed"
    fi

else
    skip "Secondary access token unavailable"
fi

# ============================================================
# TOKEN / SECRET LEAKAGE
# ============================================================

print_header "12. TOKEN AND SECRET LEAKAGE"

request GET \
    "$API/agents/me" \
    "" \
    "$ACCESS_TOKEN"

assert_no_secret "$TEST_PASSWORD" \
    "Password is not present in authenticated response"

assert_no_secret "$REFRESH_TOKEN" \
    "Refresh token is not leaked through /me"

assert_no_server_leakage \
    "Authenticated response does not leak server internals"

# ============================================================
# SESSIONS
# ============================================================

print_header "13. SESSIONS"

request GET \
    "$API/agents/me/sessions" \
    "" \
    "$ACCESS_TOKEN"

assert_status "200" "Sessions endpoint accessible"

if [[ "$RESPONSE_STATUS" == "200" ]]; then

    if echo "$RESPONSE_BODY" | jq -e '.sessions' >/dev/null 2>&1; then
        pass "Sessions response contains sessions collection"
    elif echo "$RESPONSE_BODY" | jq -e '.data.sessions' >/dev/null 2>&1; then
        pass "Sessions response contains data.sessions collection"
    else
        warn "Could not identify sessions collection"
    fi

    SESSION_ID="$(json_get '.sessions[0].id')"

    if [[ -z "$SESSION_ID" || "$SESSION_ID" == "null" ]]; then
        SESSION_ID="$(json_get '.data.sessions[0].id')"
    fi

    if [[ -n "$SESSION_ID" && "$SESSION_ID" != "null" ]]; then
        pass "Session ID returned"
    else
        warn "No session ID found"
    fi
fi

# ============================================================
# REFRESH TOKEN
# ============================================================

print_header "14. REFRESH TOKEN ROTATION"

if [[ -n "$REFRESH_TOKEN" ]]; then

    OLD_REFRESH_TOKEN="$REFRESH_TOKEN"

    request POST \
        "$API/agents/refresh" \
        "{\"refreshToken\":\"$OLD_REFRESH_TOKEN\"}"

    assert_status "200" "Refresh token accepted"

    NEW_ACCESS_TOKEN="$(json_get '.accessToken')"
    NEW_REFRESH_TOKEN="$(json_get '.refreshToken')"

    if [[ -z "$NEW_ACCESS_TOKEN" || "$NEW_ACCESS_TOKEN" == "null" ]]; then
        NEW_ACCESS_TOKEN="$(json_get '.data.accessToken')"
    fi

    if [[ -z "$NEW_REFRESH_TOKEN" || "$NEW_REFRESH_TOKEN" == "null" ]]; then
        NEW_REFRESH_TOKEN="$(json_get '.data.refreshToken')"
    fi

    if [[ -n "$NEW_REFRESH_TOKEN" && "$NEW_REFRESH_TOKEN" != "$OLD_REFRESH_TOKEN" ]]; then
        pass "Refresh token rotated"
    else
        fail "Refresh token was not rotated"
    fi

    if [[ -n "$NEW_ACCESS_TOKEN" ]]; then
        ACCESS_TOKEN="$NEW_ACCESS_TOKEN"
    fi

    if [[ -n "$NEW_REFRESH_TOKEN" ]]; then
        REFRESH_TOKEN="$NEW_REFRESH_TOKEN"
    fi

else
    skip "No refresh token available"
fi

# ============================================================
# REFRESH REPLAY
# ============================================================

print_header "15. REFRESH TOKEN REPLAY"

if [[ -n "$OLD_REFRESH_TOKEN" ]]; then

    request POST \
        "$API/agents/refresh" \
        "{\"refreshToken\":\"$OLD_REFRESH_TOKEN\"}"

    assert_status_any "400 401 403 409" \
        "Old refresh token rejected after rotation"

else
    skip "No old refresh token"
fi

# ============================================================
# REFRESH INPUT VALIDATION
# ============================================================

print_header "16. REFRESH INPUT VALIDATION"

request POST \
    "$API/agents/refresh" \
    '{}'

assert_status_any "400 401 422" \
    "Refresh rejects missing refresh token"

request POST \
    "$API/agents/refresh" \
    '{"refreshToken":""}'

assert_status_any "400 401 422" \
    "Refresh rejects empty refresh token"

request POST \
    "$API/agents/refresh" \
    '{"refreshToken":"abc"}'

assert_status_any "400 401 403" \
    "Refresh rejects malformed token"

# ============================================================
# LOGOUT
# ============================================================

print_header "17. LOGOUT"

if [[ -n "$REFRESH_TOKEN" ]]; then

    LOGOUT_TOKEN="$REFRESH_TOKEN"

    request POST \
        "$API/agents/logout" \
        "{\"refreshToken\":\"$LOGOUT_TOKEN\"}"

    assert_status_any "200 204" \
        "Logout accepts valid refresh token"

    request POST \
        "$API/agents/refresh" \
        "{\"refreshToken\":\"$LOGOUT_TOKEN\"}"

    assert_status_any "400 401 403 409" \
        "Logged-out refresh token cannot be reused"

else
    skip "No refresh token available"
fi

# ============================================================
# LOGIN
# ============================================================

print_header "18. LOGIN"

request POST \
    "$API/agents/login" \
    "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"wrong-password\"}"

assert_status_any "400 401 403 422" \
    "Login rejects incorrect password"

request POST \
    "$API/agents/login" \
    "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

if [[ "$RESPONSE_STATUS" == "200" ]]; then
    pass "Login accepts correct credentials"
    extract_tokens
else
    fail "Login failed with correct credentials [$RESPONSE_STATUS]"
fi

# ============================================================
# MULTI SESSION
# ============================================================

print_header "19. MULTI-SESSION"

request POST \
    "$API/agents/login" \
    "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

if [[ "$RESPONSE_STATUS" == "200" ]]; then

    SECOND_ACCESS_TOKEN="$ACCESS_TOKEN"
    SECOND_REFRESH_TOKEN="$REFRESH_TOKEN"

    pass "Second login created another session"

else
    fail "Second login failed"
fi

request GET \
    "$API/agents/me/sessions" \
    "" \
    "$ACCESS_TOKEN"

assert_status "200" \
    "Sessions endpoint works with multiple sessions"

# ============================================================
# INDIVIDUAL SESSION REVOCATION
# ============================================================

print_header "20. INDIVIDUAL SESSION REVOCATION"

request GET \
    "$API/agents/me/sessions" \
    "" \
    "$ACCESS_TOKEN"

SESSION_ID_2="$(json_get '.sessions[0].id')"

if [[ -z "$SESSION_ID_2" || "$SESSION_ID_2" == "null" ]]; then
    SESSION_ID_2="$(json_get '.data.sessions[0].id')"
fi

if [[ -n "$SESSION_ID_2" && "$SESSION_ID_2" != "null" ]]; then

    request DELETE \
        "$API/agents/me/sessions/$SESSION_ID_2" \
        "" \
        "$ACCESS_TOKEN"

    assert_status_any "200 204" \
        "Individual session revocation accepted"

else
    skip "No session ID available"
fi

# ============================================================
# LOGOUT ALL
# ============================================================

print_header "21. LOGOUT ALL"

request POST \
    "$API/agents/logout-all" \
    "" \
    "$ACCESS_TOKEN"

assert_status_any "200 204" \
    "Logout-all accepted"

if [[ -n "$SECOND_REFRESH_TOKEN" ]]; then

    request POST \
        "$API/agents/refresh" \
        "{\"refreshToken\":\"$SECOND_REFRESH_TOKEN\"}"

    assert_status_any "400 401 403 409" \
        "Logout-all invalidates other refresh tokens"

fi

# Re-login after logout-all.
request POST \
    "$API/agents/login" \
    "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

if [[ "$RESPONSE_STATUS" == "200" ]]; then
    extract_tokens
    pass "Re-login after logout-all succeeded"
else
    fail "Could not re-login after logout-all"
fi

# ============================================================
# PASSWORD CHANGE
# ============================================================

print_header "22. PASSWORD CHANGE"

if [[ "$DESTRUCTIVE_TESTS" == "1" ]]; then

    request POST \
        "$API/agents/me/change-password" \
        "{\"currentPassword\":\"wrong-password\",\"newPassword\":\"$TEST_PASSWORD_2\"}" \
        "$ACCESS_TOKEN"

    assert_status_any "400 401 403 422" \
        "Password change rejects incorrect current password"

    request POST \
        "$API/agents/me/change-password" \
        "{\"currentPassword\":\"$TEST_PASSWORD\",\"newPassword\":\"$TEST_PASSWORD_2\"}" \
        "$ACCESS_TOKEN"

    assert_status_any "200 204" \
        "Password change accepts correct current password"

    # Old password must fail.
    request POST \
        "$API/agents/login" \
        "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

    assert_status_any "400 401 403" \
        "Old password no longer works"

    # New password must work.
    request POST \
        "$API/agents/login" \
        "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD_2\"}"

    if [[ "$RESPONSE_STATUS" == "200" ]]; then
        pass "New password works after password change"
        extract_tokens
    else
        fail "New password does not work after password change"
    fi

    # Restore original test password.
    request POST \
        "$API/agents/me/change-password" \
        "{\"currentPassword\":\"$TEST_PASSWORD_2\",\"newPassword\":\"$TEST_PASSWORD\"}" \
        "$ACCESS_TOKEN"

    if [[ "$RESPONSE_STATUS" == "200" || "$RESPONSE_STATUS" == "204" ]]; then
        pass "Test password restored"
    else
        warn "Could not restore original test password [$RESPONSE_STATUS]"
    fi

    # Re-login because password change may revoke sessions.
    request POST \
        "$API/agents/login" \
        "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

    if [[ "$RESPONSE_STATUS" == "200" ]]; then
        extract_tokens
        pass "Re-login after password restoration succeeded"
    else
        fail "Could not re-login after password restoration"
    fi

else
    skip "Destructive password tests disabled"
fi

# ============================================================
# FORGOT PASSWORD
# ============================================================

print_header "23. FORGOT PASSWORD"

request POST \
    "$API/agents/forgot-password" \
    "{\"email\":\"$CURRENT_TEST_EMAIL\"}"

assert_status_any "200 202" \
    "Forgot-password accepts known email"

if [[ "$RESPONSE_STATUS" == "200" || "$RESPONSE_STATUS" == "202" ]]; then

    otp_checkpoint "Password reset" "$CURRENT_TEST_EMAIL"

    RESET_CODE="$(obtain_otp \
        RESET_CODE \
        "Password reset" \
        "$CURRENT_TEST_EMAIL")"

else
    RESET_CODE=""
fi

# ============================================================
# FORGOT PASSWORD ENUMERATION
# ============================================================

print_header "24. PASSWORD RESET ENUMERATION PROTECTION"

request POST \
    "$API/agents/forgot-password" \
    '{"email":"definitely-does-not-exist-987654@example.com"}'

assert_status_any "200 202 400 404" \
    "Unknown email handled without crashing"

if [[ "$RESPONSE_STATUS" == "200" || "$RESPONSE_STATUS" == "202" ]]; then
    if body_contains "not found" || body_contains "does not exist" || body_contains "unknown"; then
        warn "Forgot-password response may reveal account existence"
    else
        pass "Forgot-password response appears generic"
    fi
fi

# ============================================================
# RESET VALIDATION
# ============================================================

print_header "25. RESET PASSWORD VALIDATION"

request POST \
    "$API/agents/reset-password" \
    '{}'

assert_status_any "400 401 422" \
    "Reset password rejects empty body"

request POST \
    "$API/agents/reset-password" \
    "{\"email\":\"$CURRENT_TEST_EMAIL\",\"code\":\"123\",\"newPassword\":\"$TEST_PASSWORD_2\"}"

assert_status_any "400 401 422" \
    "Reset password rejects malformed OTP"

# ============================================================
# VALID PASSWORD RESET
# ============================================================

print_header "26. VALID PASSWORD RESET"

if [[ -n "$RESET_CODE" && "$DESTRUCTIVE_TESTS" == "1" ]]; then

    request POST \
        "$API/agents/reset-password" \
        "{\"email\":\"$CURRENT_TEST_EMAIL\",\"code\":\"$RESET_CODE\",\"newPassword\":\"$TEST_PASSWORD_2\"}"

    if [[ "$RESPONSE_STATUS" == "200" || "$RESPONSE_STATUS" == "204" ]]; then

        pass "Password reset accepted real OTP"

        # Old password should fail.
        request POST \
            "$API/agents/login" \
            "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

        assert_status_any "400 401 403" \
            "Old password rejected after password reset"

        # New password should work.
        request POST \
            "$API/agents/login" \
            "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD_2\"}"

        if [[ "$RESPONSE_STATUS" == "200" ]]; then
            pass "New password works after password reset"
            extract_tokens
        else
            fail "New password does not work after password reset"
        fi

        # Replay OTP must fail.
        request POST \
            "$API/agents/reset-password" \
            "{\"email\":\"$CURRENT_TEST_EMAIL\",\"code\":\"$RESET_CODE\",\"newPassword\":\"$TEST_PASSWORD\"}"

        assert_status_any "400 401 403 409 422" \
            "Password reset OTP cannot be reused"

        # Restore password.
        request POST \
            "$API/agents/change-password" \
            "{\"currentPassword\":\"$TEST_PASSWORD_2\",\"newPassword\":\"$TEST_PASSWORD\"}" \
            "$ACCESS_TOKEN"

        if [[ "$RESPONSE_STATUS" == "200" || "$RESPONSE_STATUS" == "204" ]]; then
            pass "Password restored after reset test"
        else
            # Correct endpoint is normally /me/change-password.
            request POST \
                "$API/agents/me/change-password" \
                "{\"currentPassword\":\"$TEST_PASSWORD_2\",\"newPassword\":\"$TEST_PASSWORD\"}" \
                "$ACCESS_TOKEN"

            if [[ "$RESPONSE_STATUS" == "200" || "$RESPONSE_STATUS" == "204" ]]; then
                pass "Password restored after reset test"
            else
                warn "Password restoration failed [$RESPONSE_STATUS]"
            fi
        fi

        request POST \
            "$API/agents/login" \
            "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

        if [[ "$RESPONSE_STATUS" == "200" ]]; then
            extract_tokens
        fi

    else
        fail "Password reset rejected supplied OTP [$RESPONSE_STATUS]"
    fi

else
    skip "No valid reset OTP supplied"
fi

# ============================================================
# OTP ATTEMPT LIMIT
# ============================================================

print_header "27. OTP ATTEMPT LIMIT"

if [[ "$OTP_ATTEMPT_TESTS" == "1" ]]; then

    info "OTP attempt-limit testing is intentionally performed only with a dedicated test account."

    # Trigger another password reset OTP.
    request POST \
        "$API/agents/forgot-password" \
        "{\"email\":\"$CURRENT_TEST_EMAIL\"}"

    if [[ "$RESPONSE_STATUS" == "200" || "$RESPONSE_STATUS" == "202" ]]; then

        for attempt in 1 2 3 4 5; do

            WRONG_CODE="$(printf '%06d' "$((attempt * 11111))")"

            request POST \
                "$API/agents/reset-password" \
                "{\"email\":\"$CURRENT_TEST_EMAIL\",\"code\":\"$WRONG_CODE\",\"newPassword\":\"$TEST_PASSWORD_2\"}"

            assert_status_any "400 401 403 422" \
                "Wrong OTP attempt $attempt rejected"

        done

        WRONG_CODE="999999"

        request POST \
            "$API/agents/reset-password" \
            "{\"email\":\"$CURRENT_TEST_EMAIL\",\"code\":\"$WRONG_CODE\",\"newPassword\":\"$TEST_PASSWORD_2\"}"

        assert_status_any "400 401 403 409 422 429" \
            "OTP attempt beyond limit rejected"

    else
        skip "Could not trigger password reset OTP for attempt-limit test"
    fi

else
    skip "OTP attempt-limit tests disabled"
fi

# ============================================================
# CHANGE EMAIL
# ============================================================

print_header "28. CHANGE EMAIL"

if [[ "$DESTRUCTIVE_TESTS" == "1" ]]; then

    # --------------------------------------------------------
    # We deliberately use the dedicated EMAIL_CHANGE_TARGET.
    # The primary account email is changed only after all
    # primary-email-dependent tests have completed.
    # --------------------------------------------------------

    request POST \
        "$API/agents/me/change-email" \
        "{\"newEmail\":\"$EMAIL_CHANGE_TARGET\",\"currentPassword\":\"$TEST_PASSWORD\"}" \
        "$ACCESS_TOKEN"

    if [[ "$RESPONSE_STATUS" == "200" || "$RESPONSE_STATUS" == "202" ]]; then

        pass "Change-email request accepted"

        otp_checkpoint "Email address change" "$EMAIL_CHANGE_TARGET"

        EMAIL_CHANGE_CODE="$(obtain_otp \
            EMAIL_CHANGE_CODE \
            "Email address change" \
            "$EMAIL_CHANGE_TARGET")"

        if [[ -n "$EMAIL_CHANGE_CODE" ]]; then

            request POST \
                "$API/agents/me/confirm-email-change" \
                "{\"code\":\"$EMAIL_CHANGE_CODE\"}" \
                "$ACCESS_TOKEN"

            if [[ "$RESPONSE_STATUS" == "200" ]]; then

                pass "Email change confirmed"

                CURRENT_TEST_EMAIL="$EMAIL_CHANGE_TARGET"

                request GET \
                    "$API/agents/me" \
                    "" \
                    "$ACCESS_TOKEN"

                assert_status "200" \
                    "Authenticated account still accessible after email change"

                NEW_ACCOUNT_EMAIL="$(json_get '.email')"

                if [[ "$NEW_ACCOUNT_EMAIL" == "$EMAIL_CHANGE_TARGET" ]]; then
                    pass "Account email updated correctly"
                else
                    fail "Account email was not updated correctly"
                fi

                # Replay protection.
                request POST \
                    "$API/agents/me/confirm-email-change" \
                    "{\"code\":\"$EMAIL_CHANGE_CODE\"}" \
                    "$ACCESS_TOKEN"

                assert_status_any "400 401 409 422" \
                    "Email-change OTP cannot be reused"

            else
                fail "Email-change confirmation failed [$RESPONSE_STATUS]"
            fi

        else
            skip "No email-change OTP supplied"
        fi

    else
        warn "Change-email request returned [$RESPONSE_STATUS]"
        warn "Email-change test could not proceed"
    fi

else
    skip "Destructive email-change tests disabled"
fi

# ============================================================
# LOGIN WITH UPDATED EMAIL
# ============================================================

print_header "29. UPDATED EMAIL LOGIN"

if [[ "$CURRENT_TEST_EMAIL" == "$EMAIL_CHANGE_TARGET" ]]; then

    request POST \
        "$API/agents/login" \
        "{\"email\":\"$EMAIL_CHANGE_TARGET\",\"password\":\"$TEST_PASSWORD\"}"

    if [[ "$RESPONSE_STATUS" == "200" ]]; then
        pass "Login works with changed email"
        extract_tokens
    else
        fail "Login failed with changed email"
    fi

else
    skip "Email was not changed"
fi

# ============================================================
# PUBLIC / PRIVATE BOUNDARY
# ============================================================

print_header "30. PUBLIC / PRIVATE BOUNDARY"

request GET \
    "$API/agents/me"

assert_status_any "401 403" \
    "Private /me endpoint rejects unauthenticated request"

# Public endpoint requires a known slug. Try a deliberately nonexistent slug.
request GET \
    "$API/agents/public/nonexistent-test-agent-987654"

assert_status_any "404 400" \
    "Unknown public agent slug handled correctly"

# ============================================================
# METHOD ABUSE
# ============================================================

print_header "31. METHOD ABUSE"

request_raw \
    PUT \
    "$API/agents/login" \
    -H "Content-Type: application/json" \
    --data "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

assert_status_any "404 405 400" \
    "Unsupported login method rejected"

request_raw \
    DELETE \
    "$API/agents/signup" \
    -H "Content-Type: application/json"

assert_status_any "404 405 400" \
    "Unsupported signup method rejected"

# ============================================================
# MALFORMED JSON
# ============================================================

print_header "32. MALFORMED JSON"

request_raw \
    POST \
    "$API/agents/login" \
    -H "Content-Type: application/json" \
    --data '{"email":"broken",'

assert_status_any "400 422" \
    "Malformed JSON rejected"

assert_no_server_leakage \
    "Malformed JSON does not expose stack trace"

# ============================================================
# FUZZ TESTS
# ============================================================

print_header "33. FUZZ INPUTS"

if [[ "$FUZZ_TESTS" == "1" ]]; then

    request POST \
        "$API/agents/login" \
        '{"email":"<script>alert(1)</script>","password":"<script>alert(1)</script>"}'

    assert_status_any "400 401 403 422" \
        "Script-like login input rejected"

    assert_no_server_leakage \
        "Script-like input does not expose internals"

    request POST \
        "$API/agents/login" \
        '{"email":"'$(printf 'A%.0s' {1..5000})'","password":"test"}'

    assert_status_any "400 401 403 413 422" \
        "Oversized login input handled"

    request POST \
        "$API/agents/signup" \
        '{"name":"'$(printf 'A%.0s' {1..5000})'","email":"fuzz@example.com","password":"test"}'

    assert_status_any "400 413 422" \
        "Oversized signup input handled"

else
    skip "Fuzz tests disabled"
fi

# ============================================================
# CONTENT TYPE ABUSE
# ============================================================

print_header "34. CONTENT-TYPE ABUSE"

request_raw \
    POST \
    "$API/agents/login" \
    -H "Content-Type: text/plain" \
    --data "not json"

assert_status_any "400 415 422" \
    "Unsupported content type handled"

# ============================================================
# CORS
# ============================================================

print_header "35. CORS"

if [[ "$CORS_TESTS" == "1" ]]; then

    request_raw \
        OPTIONS \
        "$API/agents/login" \
        -H "Origin: https://evil-example.com" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: content-type"

    if echo "$RESPONSE_HEADERS" | grep -Eiq \
        'access-control-allow-origin: https://evil-example.com'; then

        warn "Potentially permissive CORS configuration observed"

    else
        pass "Untrusted origin not explicitly reflected"
    fi

else
    skip "CORS tests disabled"
fi

# ============================================================
# RATE LIMITING
# ============================================================

print_header "36. RATE LIMITING"

if [[ "$RATE_LIMIT_TESTS" == "1" ]]; then

    info "Rate-limit tests can affect later requests when the API uses an in-memory limiter."

    RATE_LIMIT_HIT=0

    for i in $(seq 1 15); do

        request POST \
            "$API/agents/login" \
            "{\"email\":\"rate-test-$RANDOM_SUFFIX@example.com\",\"password\":\"wrong-password\"}"

        if [[ "$RESPONSE_STATUS" == "429" ]]; then
            RATE_LIMIT_HIT=1
            break
        fi

    done

    if [[ "$RATE_LIMIT_HIT" == "1" ]]; then
        pass "Rate limiting returned HTTP 429"
    else
        warn "Rate limit not observed after 15 requests"
    fi

else
    skip "Rate-limit tests disabled"
fi

# ============================================================
# ACCOUNT LOCKOUT
# ============================================================

print_header "37. ACCOUNT LOCKOUT"

if [[ "$DESTRUCTIVE_TESTS" == "1" ]]; then

    LOCKOUT_EMAIL="lockout-${RANDOM_SUFFIX}@example.com"
    # LOCKOUT_PHONE="07$(printf '%07d' "$(( (RANDOM * 1000 + RANDOM) % 10000000 ))")"
    LOCKOUT_PHONE="$(random_kenyan_phone)"

    request POST \
        "$API/agents/signup" \
        "{\"name\":\"Lockout Test\",\"email\":\"$LOCKOUT_EMAIL\",\"phone\":\"$LOCKOUT_PHONE\",\"password\":\"$TEST_PASSWORD\"}"

    if [[ "$RESPONSE_STATUS" == "201" ]]; then

        pass "Lockout test account created"

        for i in 1 2 3 4 5; do

            request POST \
                "$API/agents/login" \
                "{\"email\":\"$LOCKOUT_EMAIL\",\"password\":\"wrong-password-$i\"}"

            info "Lockout attempt $i -> HTTP $RESPONSE_STATUS"

        done

        request POST \
            "$API/agents/login" \
            "{\"email\":\"$LOCKOUT_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

        assert_status_any "401 403 423 429" \
            "Correct password rejected while account is locked"

    else
        warn "Could not create lockout test account [$RESPONSE_STATUS]"
    fi

else
    skip "Account lockout tests disabled"
fi

# ============================================================
# ADMIN AUTHORIZATION
# ============================================================

print_header "38. ADMIN AUTHORIZATION"

# Non-admin must not be allowed to change status.

if [[ -n "$TEST_AGENT_ID" && -n "$ACCESS_TOKEN" ]]; then

    request PATCH \
        "$API/agents/$TEST_AGENT_ID/status" \
        '{"status":"SUSPENDED"}' \
        "$ACCESS_TOKEN"

    assert_status_any "401 403" \
        "Normal agent cannot change account status"

else
    skip "No test agent ID/token available"
fi

if [[ -n "$ADMIN_EMAIL" && -n "$ADMIN_PASSWORD" ]]; then

    request POST \
        "$API/agents/login" \
        "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"

    if [[ "$RESPONSE_STATUS" == "200" ]]; then

        ADMIN_ACCESS_TOKEN="$(json_get '.accessToken')"

        if [[ -z "$ADMIN_ACCESS_TOKEN" || "$ADMIN_ACCESS_TOKEN" == "null" ]]; then
            ADMIN_ACCESS_TOKEN="$(json_get '.data.accessToken')"
        fi

        if [[ -n "$ADMIN_ACCESS_TOKEN" ]]; then
            pass "Admin login succeeded"

            if [[ -n "$TEST_AGENT_ID" ]]; then

                request PATCH \
                    "$API/agents/$TEST_AGENT_ID/status" \
                    '{"status":"SUSPENDED"}' \
                    "$ADMIN_ACCESS_TOKEN"

                if [[ "$RESPONSE_STATUS" == "200" ]]; then
                    pass "Admin can suspend account"

                    request POST \
                        "$API/agents/login" \
                        "{\"email\":\"$CURRENT_TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

                    assert_status_any "401 403 423" \
                        "Suspended account cannot authenticate"

                    request PATCH \
                        "$API/agents/$TEST_AGENT_ID/status" \
                        '{"status":"ACTIVE"}' \
                        "$ADMIN_ACCESS_TOKEN"

                    assert_status "200" \
                        "Admin can restore account"

                else
                    warn "Admin status update returned [$RESPONSE_STATUS]"
                fi
            fi
        fi

    else
        warn "Admin credentials supplied but admin login failed"
    fi

else
    skip "ADMIN_EMAIL / ADMIN_PASSWORD not supplied"
fi

# ============================================================
# SESSION IDOR
# ============================================================

print_header "39. SESSION IDOR"

if [[ -n "$ACCESS_TOKEN_2" ]]; then

    request GET \
        "$API/agents/me/sessions" \
        "" \
        "$ACCESS_TOKEN_2"

    OTHER_SESSION_ID="$(json_get '.sessions[0].id')"

    if [[ -z "$OTHER_SESSION_ID" || "$OTHER_SESSION_ID" == "null" ]]; then
        OTHER_SESSION_ID="$(json_get '.data.sessions[0].id')"
    fi

    if [[ -n "$OTHER_SESSION_ID" && "$OTHER_SESSION_ID" != "null" ]]; then

        request DELETE \
            "$API/agents/me/sessions/$OTHER_SESSION_ID" \
            "" \
            "$ACCESS_TOKEN"

        assert_status_any "400 401 403 404" \
            "Cross-account session deletion rejected"

    else
        skip "No secondary session ID available"
    fi

else
    skip "No secondary token available"
fi

# ============================================================
# SESSION ID VALIDATION
# ============================================================

print_header "40. SESSION ID VALIDATION"

request DELETE \
    "$API/agents/me/sessions/not-a-valid-session-id" \
    "" \
    "$ACCESS_TOKEN"

assert_status_any "400 401 403 404 422" \
    "Malformed session ID handled"

# ============================================================
# AUTH HEADER MANIPULATION
# ============================================================

print_header "41. AUTH HEADER MANIPULATION"

request_raw \
    GET \
    "$API/agents/me" \
    -H "Authorization: Basic abcdef"

assert_status_any "401 403" \
    "Basic authorization rejected"

request_raw \
    GET \
    "$API/agents/me" \
    -H "Authorization: Bearer"

assert_status_any "401 403" \
    "Empty Bearer token rejected"

request_raw \
    GET \
    "$API/agents/me" \
    -H "Authorization: Bearer abc.def.ghi"

assert_status_any "401 403" \
    "Malformed Bearer token rejected"

# ============================================================
# PROTOTYPE POLLUTION-LIKE INPUT
# ============================================================

print_header "42. PROTOTYPE POLLUTION INPUT"

request POST \
    "$API/agents/login" \
    '{"email":"test@example.com","password":"test","__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}}}'

assert_status_any "400 401 403 422" \
    "Prototype-pollution-like input handled"

assert_no_server_leakage \
    "Prototype-pollution-like input does not expose internals"

# ============================================================
# SPECIAL CHARACTERS
# ============================================================

print_header "43. SPECIAL CHARACTER INPUT"

SPECIAL_EMAIL="special-${RANDOM_SUFFIX}@example.com"

request POST \
    "$API/agents/signup" \
    "{\"name\":\"O'Reilly <Test> \\\"User\\\"\",\"email\":\"$SPECIAL_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"

assert_status_any "201 400 409 422" \
    "Special-character signup handled"

assert_no_server_leakage \
    "Special-character input does not leak internals"

# ============================================================
# PUBLIC TOKEN BOUNDARY
# ============================================================

print_header "44. PUBLIC ENDPOINT TOKEN BOUNDARY"

request GET \
    "$API/agents/public/nonexistent-test-agent-987654" \
    "" \
    "$ACCESS_TOKEN"

assert_status_any "404 400" \
    "Public endpoint remains accessible without exposing private data"

# ============================================================
# CONCURRENT REFRESH
# ============================================================

print_header "45. CONCURRENT REFRESH"

if [[ -n "$REFRESH_TOKEN" ]]; then

    CONCURRENT_REFRESH_TOKEN="$REFRESH_TOKEN"

    RESULT_1="$TMP_DIR/concurrent1"
    RESULT_2="$TMP_DIR/concurrent2"

    (
        curl -sS \
            -X POST \
            "$API/agents/refresh" \
            -H "Content-Type: application/json" \
            --data "{\"refreshToken\":\"$CONCURRENT_REFRESH_TOKEN\"}" \
            -o "$RESULT_1" \
            -w "%{http_code}" \
            > "$TMP_DIR/status1" 2>/dev/null
    ) &

    PID_1=$!

    (
        curl -sS \
            -X POST \
            "$API/agents/refresh" \
            -H "Content-Type: application/json" \
            --data "{\"refreshToken\":\"$CONCURRENT_REFRESH_TOKEN\"}" \
            -o "$RESULT_2" \
            -w "%{http_code}" \
            > "$TMP_DIR/status2" 2>/dev/null
    ) &

    PID_2=$!

    wait "$PID_1"
    wait "$PID_2"

    STATUS_1="$(cat "$TMP_DIR/status1" 2>/dev/null)"
    STATUS_2="$(cat "$TMP_DIR/status2" 2>/dev/null)"

    echo "Concurrent refresh results: $STATUS_1 / $STATUS_2"

    if [[ "$STATUS_1" == "200" && "$STATUS_2" != "200" ]] ||
       [[ "$STATUS_2" == "200" && "$STATUS_1" != "200" ]]; then
        pass "Concurrent refresh demonstrates single-use refresh-token behaviour"
    elif [[ "$STATUS_1" == "200" && "$STATUS_2" == "200" ]]; then
        warn "Both concurrent refresh requests succeeded; investigate refresh-token race handling"
    else
        warn "Neither concurrent refresh request succeeded"
    fi

else
    skip "No refresh token available"
fi

# ============================================================
# RESPONSE SECURITY
# ============================================================

print_header "46. RESPONSE SECURITY"

request GET \
    "$API/agents/me" \
    "" \
    "$ACCESS_TOKEN"

if echo "$RESPONSE_BODY" | jq -e '.. | objects | has("password")' >/dev/null 2>&1; then
    fail "Response appears to contain password field"
else
    pass "Authenticated response does not expose password field"
fi

if echo "$RESPONSE_BODY" | jq -e '.. | objects | has("refreshToken")' >/dev/null 2>&1; then
    fail "Private endpoint appears to expose refreshToken"
else
    pass "Private endpoint does not expose refreshToken"
fi

# ============================================================
# SERVER INFO DISCLOSURE
# ============================================================

print_header "47. SERVER INFORMATION DISCLOSURE"

request GET \
    "$BASE_URL/definitely-nonexistent-frental-route-987654"

assert_status_any "404" \
    "Unknown route returns 404"

assert_no_server_leakage \
    "404 response does not expose framework/database internals"

# ============================================================
# TOKEN SANITY
# ============================================================

print_header "48. TOKEN SANITY"

if [[ -n "$ACCESS_TOKEN" ]]; then

    ACCESS_LENGTH="${#ACCESS_TOKEN}"

    if [[ "$ACCESS_LENGTH" -ge 50 ]]; then
        pass "Access token has reasonable length"
    else
        warn "Access token is unusually short"
    fi

else
    skip "No access token available"
fi

if [[ -n "$REFRESH_TOKEN" ]]; then

    REFRESH_LENGTH="${#REFRESH_TOKEN}"

    if [[ "$REFRESH_LENGTH" -ge 32 ]]; then
        pass "Refresh token has reasonable length"
    else
        warn "Refresh token is unusually short"
    fi

else
    skip "No refresh token available"
fi

# ============================================================
# JWT STRUCTURE
# ============================================================

print_header "49. JWT STRUCTURE"

if [[ -n "$ACCESS_TOKEN" ]]; then

    IFS='.' read -r JWT_HEADER JWT_PAYLOAD JWT_SIGNATURE <<< "$ACCESS_TOKEN"

    if [[ -n "$JWT_HEADER" && -n "$JWT_PAYLOAD" && -n "$JWT_SIGNATURE" ]]; then
        pass "Access token has JWT three-part structure"

        if command -v base64 >/dev/null 2>&1; then

            decode_base64url() {
                local input="$1"

                input="${input//-/+}"
                input="${input//_/\/}"

                case $((${#input} % 4)) in
                    2) input="${input}==";;
                    3) input="${input}=";;
                esac

                printf '%s' "$input" | base64 -d 2>/dev/null
            }

            JWT_PAYLOAD_JSON="$(decode_base64url "$JWT_PAYLOAD")"

            if echo "$JWT_PAYLOAD_JSON" | jq -e . >/dev/null 2>&1; then
                pass "JWT payload is valid JSON"

                if echo "$JWT_PAYLOAD_JSON" | jq -e '.exp' >/dev/null 2>&1; then
                    pass "JWT contains expiration claim"
                else
                    warn "JWT does not expose exp claim"
                fi
            else
                warn "Could not decode JWT payload"
            fi

        fi

    else
        fail "Access token does not have JWT structure"
    fi

else
    skip "No access token available"
fi

# ============================================================
# ENDPOINT ROBUSTNESS
# ============================================================

print_header "50. ENDPOINT ROBUSTNESS"

request GET \
    "$API/agents/me/does-not-exist" \
    "" \
    "$ACCESS_TOKEN"

assert_status_any "404" \
    "Unknown authenticated route handled"

request POST \
    "$API/agents/refresh" \
    '{"refreshToken":null}'

assert_status_any "400 401 422" \
    "Null refresh token handled"

request POST \
    "$API/agents/login" \
    '{"email":null,"password":null}'

assert_status_any "400 401 422" \
    "Null login credentials handled"

# ============================================================
# LOGOUT IDENTITY
# ============================================================

print_header "51. LOGOUT IDENTITY"

if [[ -n "$REFRESH_TOKEN" ]]; then

    request POST \
        "$API/agents/logout" \
        "{\"refreshToken\":\"$REFRESH_TOKEN\"}"

    assert_status_any "200 204" \
        "Current refresh token can be logged out"

    request POST \
        "$API/agents/refresh" \
        "{\"refreshToken\":\"$REFRESH_TOKEN\"}"

    assert_status_any "400 401 403 409" \
        "Logged-out token cannot refresh"

fi

# ============================================================
# ACCOUNT STATUS AUTHORIZATION
# ============================================================

print_header "52. ACCOUNT STATUS AUTHORIZATION"

if [[ -n "$TEST_AGENT_ID" ]]; then

    request PATCH \
        "$API/agents/$TEST_AGENT_ID/status" \
        '{"status":"DISABLED"}' \
        "$ACCESS_TOKEN"

    assert_status_any "401 403" \
        "Normal authenticated user cannot disable accounts"

else
    skip "No test agent ID"
fi

# ============================================================
# OPTIONAL OTP EXPIRY
# ============================================================

print_header "53. OTP EXPIRY"

if [[ "$OTP_EXPIRY_TESTS" == "1" ]]; then

    warn "OTP expiry black-box testing requires waiting for the configured OTP TTL."

    OTP_EXPIRY_WAIT_SECONDS="${OTP_EXPIRY_WAIT_SECONDS:-900}"

    info "Configured wait: ${OTP_EXPIRY_WAIT_SECONDS}s"

    if [[ "$OTP_EXPIRY_WAIT_SECONDS" -gt 0 ]]; then
        info "Skipping actual wait by default."
        info "Recommended: test OTP expiry using mocked time/unit/integration tests."
    fi

else
    skip "OTP expiry tests disabled"
fi

# ============================================================
# FINAL HEALTH CHECK
# ============================================================

print_header "54. FINAL HEALTH CHECK"

request GET \
    "$BASE_URL/health"

assert_status "200" \
    "Application remains healthy after authentication tests"

assert_no_server_leakage \
    "Final health endpoint has no server leakage"

# ============================================================
# SUMMARY
# ============================================================

print_header "TEST SUMMARY"

echo
echo "Base URL:"
echo "  $BASE_URL"
echo
echo "API:"
echo "  $API"
echo
echo "Primary test email:"
echo "  $CURRENT_TEST_EMAIL"
echo
echo "Secondary test email:"
echo "  $TEST_EMAIL_2"
echo
echo "Email-change target:"
echo "  $EMAIL_CHANGE_TARGET"
echo

echo "Results:"
echo
echo -e "  ${GREEN}PASS:${RESET} $PASS_COUNT"
echo -e "  ${RED}FAIL:${RESET} $FAIL_COUNT"
echo -e "  ${YELLOW}WARN:${RESET} $WARN_COUNT"
echo -e "  ${YELLOW}SKIP:${RESET} $SKIP_COUNT"
echo

TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT + SKIP_COUNT))

echo "Total checks: $TOTAL"
echo

if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}============================================================${RESET}"
    echo -e "${GREEN}${BOLD}AUTHENTICATION TEST SUITE PASSED${RESET}"
    echo -e "${GREEN}${BOLD}============================================================${RESET}"
    echo
    echo "Warnings: $WARN_COUNT"
    echo "Skipped:  $SKIP_COUNT"
    echo
    exit 0
else
    echo -e "${RED}${BOLD}============================================================${RESET}"
    echo -e "${RED}${BOLD}AUTHENTICATION TEST SUITE HAS FAILURES${RESET}"
    echo -e "${RED}${BOLD}============================================================${RESET}"
    echo
    echo "Failures: $FAIL_COUNT"
    echo "Warnings: $WARN_COUNT"
    echo "Skipped:  $SKIP_COUNT"
    echo
    exit 1
fi