-- Add the entities required by the legacy LSPL workflow. Existing accounts
-- retain APPROVED status; new registrations are created as PENDING in code.
CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "User"
  ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "kookName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "backgroundImage" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "importToken" TEXT NOT NULL DEFAULT '';

-- Backfill a distinct token for every existing account before the unique index
-- is created, then drop the temporary default so the column matches the schema
-- (Prisma generates the value client-side with cuid()).
UPDATE "User"
SET "importToken" = md5(random()::text || clock_timestamp()::text || id::text);
ALTER TABLE "User" ALTER COLUMN "importToken" DROP DEFAULT;
CREATE UNIQUE INDEX "User_importToken_key" ON "User"("importToken");
CREATE INDEX "User_status_idx" ON "User"("status");

ALTER TABLE "PlayerProfile"
  ADD COLUMN "mainPosition" TEXT NOT NULL DEFAULT 'FILL',
  ADD COLUMN "subPosition" TEXT NOT NULL DEFAULT 'FILL';
ALTER TABLE "Match"
  ADD COLUMN "liveUrl" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "useFee" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "currentRound" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MatchSignup"
  ADD COLUMN "displayName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "mainPosition" TEXT NOT NULL DEFAULT 'FILL',
  ADD COLUMN "subPosition" TEXT NOT NULL DEFAULT 'FILL',
  ADD COLUMN "rankAtSignup" TEXT NOT NULL DEFAULT 'UNRANKED',
  ADD COLUMN "canSubstitute" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "positionOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "teamPosition" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "teamId" INTEGER;

CREATE TABLE "Team" (
  "id" SERIAL NOT NULL,
  "matchId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Team_matchId_name_key" ON "Team"("matchId", "name");
CREATE INDEX "Team_matchId_idx" ON "Team"("matchId");
ALTER TABLE "Team" ADD CONSTRAINT "Team_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchSignup" ADD CONSTRAINT "MatchSignup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MatchSignup_teamId_idx" ON "MatchSignup"("teamId");

CREATE TABLE "MatchRound" (
  "id" SERIAL NOT NULL,
  "matchId" INTEGER NOT NULL,
  "roundNo" INTEGER NOT NULL DEFAULT 1,
  "teamOneId" INTEGER NOT NULL,
  "teamTwoId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchRound_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatchRound_matchId_roundNo_idx" ON "MatchRound"("matchId", "roundNo");
ALTER TABLE "MatchRound" ADD CONSTRAINT "MatchRound_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchRound" ADD CONSTRAINT "MatchRound_teamOneId_fkey" FOREIGN KEY ("teamOneId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchRound" ADD CONSTRAINT "MatchRound_teamTwoId_fkey" FOREIGN KEY ("teamTwoId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MatchScore" (
  "id" SERIAL NOT NULL,
  "matchId" INTEGER NOT NULL,
  "roundNo" INTEGER NOT NULL DEFAULT 1,
  "teamOneId" INTEGER NOT NULL,
  "teamTwoId" INTEGER NOT NULL,
  "scoreOne" INTEGER NOT NULL DEFAULT 0,
  "scoreTwo" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MatchScore_matchId_roundNo_teamOneId_teamTwoId_key" ON "MatchScore"("matchId", "roundNo", "teamOneId", "teamTwoId");
CREATE INDEX "MatchScore_matchId_roundNo_idx" ON "MatchScore"("matchId", "roundNo");
ALTER TABLE "MatchScore" ADD CONSTRAINT "MatchScore_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchScore" ADD CONSTRAINT "MatchScore_teamOneId_fkey" FOREIGN KEY ("teamOneId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchScore" ADD CONSTRAINT "MatchScore_teamTwoId_fkey" FOREIGN KEY ("teamTwoId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MatchGameRecord" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "matchId" INTEGER NOT NULL,
  "teamId" INTEGER,
  "champion" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "deaths" INTEGER NOT NULL DEFAULT 0,
  "assists" INTEGER NOT NULL DEFAULT 0,
  "isMvp" BOOLEAN NOT NULL DEFAULT false,
  "isSvp" BOOLEAN NOT NULL DEFAULT false,
  "teamRank" INTEGER NOT NULL DEFAULT 0,
  "level" INTEGER NOT NULL DEFAULT 0,
  "cs" INTEGER NOT NULL DEFAULT 0,
  "gold" INTEGER NOT NULL DEFAULT 0,
  "vision" INTEGER NOT NULL DEFAULT 0,
  "items" TEXT NOT NULL DEFAULT '',
  "gameNo" INTEGER NOT NULL DEFAULT 1,
  "roundNo" INTEGER NOT NULL DEFAULT 1,
  "playedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchGameRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatchGameRecord_matchId_roundNo_gameNo_idx" ON "MatchGameRecord"("matchId", "roundNo", "gameNo");
CREATE INDEX "MatchGameRecord_userId_playedAt_idx" ON "MatchGameRecord"("userId", "playedAt");
ALTER TABLE "MatchGameRecord" ADD CONSTRAINT "MatchGameRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchGameRecord" ADD CONSTRAINT "MatchGameRecord_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchGameRecord" ADD CONSTRAINT "MatchGameRecord_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
