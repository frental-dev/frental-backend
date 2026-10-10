-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "AgentDeviceToken" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'ANDROID',
    "deviceModel" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentDeviceToken_fcmToken_key" ON "AgentDeviceToken"("fcmToken");

-- CreateIndex
CREATE INDEX "AgentDeviceToken_agentId_idx" ON "AgentDeviceToken"("agentId");

-- AddForeignKey
ALTER TABLE "AgentDeviceToken" ADD CONSTRAINT "AgentDeviceToken_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
