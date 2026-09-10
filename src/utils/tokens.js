const crypto = require("crypto");

/** A random raw token — this is what goes in the email link / is returned to the client. */
function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** SHA-256 hash of a raw token — this is what gets stored in the database.
 * Deterministic and one-way: given the raw token from an incoming request,
 * hash it and look up the hash — never store or compare raw values. */
function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** A random 6-digit numeric code, zero-padded (e.g. "042817"). */
function generateOtpCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

module.exports = { generateRawToken, hashToken, generateOtpCode };
