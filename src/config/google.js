const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verifies a Google ID token (sent by the app after Google Sign-In) and
 * returns its payload. Throws if the token is invalid, expired, or wasn't
 * issued for this app's GOOGLE_CLIENT_ID.
 */
async function verifyGoogleIdToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload(); // { sub, email, email_verified, name, picture, ... }
}

module.exports = { verifyGoogleIdToken };
