const { PrismaClient } = require('@prisma/client');
const { getFirebaseAdmin } = require('../config/firebase');

const prisma = new PrismaClient();

/**
 * PROVISIONAL: there is no notification-inbox/read-tracking table anywhere
 * in this system — the FCM spec assumes one exists (`getUnreadNotificationCount`)
 * but never defines it. This stands in with the same "new leads" count the
 * Dashboard already surfaces, which is a reasonable proxy for "things
 * needing attention" but is NOT a true count of unread push notifications.
 * If a real notification inbox gets built later (a logged, read/unread-
 * tracked record per push sent), replace this with a real count from that
 * table instead.
 */
async function getUnreadCount(agentId) {
  return prisma.lead.count({ where: { agentId, status: 'NEW' } });
}

/**
 * Sends a data-only FCM push to every device registered for an agent.
 * Silently no-ops (logs, doesn't throw) if Firebase isn't configured or
 * the agent has no registered devices — a missing push integration or an
 * agent who hasn't opened the app yet should never break the request that
 * triggered this (lead creation, a viewing being scheduled, etc.).
 */
async function sendNotificationToAgent(agentId, notificationData) {
  const admin = getFirebaseAdmin();
  if (!admin) return; // already logged once at init time

  try {
    const tokenRecords = await prisma.agentDeviceToken.findMany({
      where: { agentId },
      select: { fcmToken: true },
    });

    if (tokenRecords.length === 0) {
      console.log(`[fcm] no registered devices for agent ${agentId}, skipping`);
      return;
    }

    const fcmTokens = tokenRecords.map((r) => r.fcmToken);

    const unreadCount =
      notificationData.unreadCount !== undefined
        ? notificationData.unreadCount
        : await getUnreadCount(agentId);

    // FCM constraint: every value in `data` MUST be a string — no nested
    // objects, numbers, or booleans. No top-level `notification` key either
    // (see the spec doc's section 1) — that would let Android silently
    // auto-display a default system notification instead of invoking
    // FirebaseMessagingService.onMessageReceived, which breaks custom
    // handling, deep links, and the unread counter in background/killed state.
    const dataPayload = {
      title: String(notificationData.title || ''),
      body: String(notificationData.body || ''),
      type: String(notificationData.type || 'SYSTEM_ALERT'),
      entityId: String(notificationData.entityId || ''),
      entityType: String(notificationData.entityType || ''),
      clickAction: String(notificationData.clickAction || ''),
      unreadCount: String(unreadCount),
      timestamp: new Date().toISOString(),
    };

    const message = {
      tokens: fcmTokens,
      data: dataPayload,
      android: {
        priority: 'high',
        ttl: 86400 * 1000, // 24 hours
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[fcm] sent to agent ${agentId}: ${response.successCount} ok, ${response.failureCount} failed`);

    if (response.failureCount > 0) {
      const staleTokens = [];
      response.responses.forEach((resp, i) => {
        if (!resp.success) {
          const code = resp.error?.code;
          console.warn(`[fcm] delivery failed for a token: ${code}`);
          if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
            staleTokens.push(fcmTokens[i]);
          }
        }
      });

      if (staleTokens.length > 0) {
        await prisma.agentDeviceToken.deleteMany({ where: { fcmToken: { in: staleTokens } } });
        console.log(`[fcm] removed ${staleTokens.length} stale token(s)`);
      }
    }
  } catch (err) {
    // A push notification failing should never break the request that
    // triggered it — log and move on.
    console.error(`[fcm] failed to send to agent ${agentId}:`, err.message);
  }
}

module.exports = { sendNotificationToAgent, getUnreadCount };
