const crypto = require('crypto');

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** A random 6-digit numeric code, zero-padded (e.g. "042817"). Used for
 * email verification — entered in-app rather than clicked as a link. */
function generateOtpCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

module.exports = { generateRawToken, hashToken, generateOtpCode };
