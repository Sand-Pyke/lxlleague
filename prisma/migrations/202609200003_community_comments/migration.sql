CREATE TABLE "CommunityComment" (
    "id" SERIAL NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityComment_createdAt_idx" ON "CommunityComment"("createdAt");
