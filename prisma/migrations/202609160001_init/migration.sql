-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('CREATED', 'LIVE', 'FINISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(24) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'FILL',
    "rank" TEXT NOT NULL DEFAULT 'UNRANKED',
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "kda" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mvp" INTEGER NOT NULL DEFAULT 0,
    "bio" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '/assets/avatars/u2.jpg',

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'CREATED',
    "bo" TEXT NOT NULL DEFAULT 'BO3',
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "teamCount" INTEGER NOT NULL DEFAULT 2,
    "blueTeam" TEXT NOT NULL DEFAULT '蓝色方',
    "redTeam" TEXT NOT NULL DEFAULT '红色方',
    "blueScore" INTEGER NOT NULL DEFAULT 0,
    "redScore" INTEGER NOT NULL DEFAULT 0,
    "round" TEXT NOT NULL DEFAULT '常规赛',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSignup" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "matchId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "PlayerProfile_userId_key" ON "PlayerProfile"("userId");
CREATE UNIQUE INDEX "MatchSignup_userId_matchId_key" ON "MatchSignup"("userId", "matchId");
CREATE INDEX "MatchSignup_matchId_idx" ON "MatchSignup"("matchId");

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchSignup" ADD CONSTRAINT "MatchSignup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchSignup" ADD CONSTRAINT "MatchSignup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
