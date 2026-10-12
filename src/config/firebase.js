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

let firebaseAdmin = null;

function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;

  const rawConfig = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawConfig) return null;

  try {
    const serviceAccount = JSON.parse(rawConfig);

    if (
      !serviceAccount.project_id ||
      !serviceAccount.client_email ||
      !serviceAccount.private_key
    ) {
      throw new Error(
        "Service account must contain project_id, client_email and private_key",
      );
    }

    const { getApps, initializeApp, cert } = require("firebase-admin/app");
    const { getMessaging } = require("firebase-admin/messaging");

    // Reuse an existing default app, or initialize it.
    const existingApp = getApps().find((app) => app.name === "[DEFAULT]");

    const app =
      existingApp ||
      initializeApp({
        credential: cert({
          ...serviceAccount,
          private_key: serviceAccount.private_key.replace(/\\n/g, "\n"),
        }),
      });

    // Preserve the interface used by notificationService.js.
    firebaseAdmin = {
      app,
      messaging: () => getMessaging(app),
    };

    console.info("[fcm] Firebase Admin initialized", {
      projectId: serviceAccount.project_id,
    });

    return firebaseAdmin;
  } catch (err) {
    console.error(
      "[fcm] Firebase Admin initialization failed:",
      err.stack || err.message,
    );
    return null;
  }
}

module.exports = { getFirebaseAdmin };
