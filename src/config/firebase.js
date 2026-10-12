/**
 * Firebase Admin init for FCM push notifications, opt-in via
 * FIREBASE_SERVICE_ACCOUNT_JSON (the full service account JSON as a
 * one-line string env var — Firebase Console → Project Settings →
 * Service Accounts → Generate New Private Key).
 *
 * Unlike the spec's reference implementation, this never throws at
 * require-time if unconfigured — every other optional integration in this
 * project (Brevo, Google Sign-In, Sentry) degrades the same way, and local
 * dev / a misconfigured environment shouldn't crash on boot over this.
 */
let admin = null;

function getFirebaseAdmin() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  console.info("[fcm] service account validation", {
    projectIdPresent: Boolean(serviceAccount.project_id),
    clientEmailPresent: Boolean(serviceAccount.client_email),
    privateKeyPresent: Boolean(serviceAccount.private_key),
    privateKeyType: typeof serviceAccount.private_key,
    privateKeyLength:
      typeof serviceAccount.private_key === "string"
        ? serviceAccount.private_key.length
        : null,
  });

  if (admin) return admin;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;

  try {
    const firebaseAdmin = require("firebase-admin");
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    );

    if (!firebaseAdmin.apps.length) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
      });
    }
    admin = firebaseAdmin;
    console.info("[fcm] Firebase Admin initialized");
    return admin;
  } catch (err) {
    console.error(
      "[fcm] failed to initialize Firebase Admin — push notifications disabled:",
      err.message,
    );
    return null;
  }
}

module.exports = { getFirebaseAdmin };
