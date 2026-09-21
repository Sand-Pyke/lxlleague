-- AlterTable: 后台手动指定的对战队伍（原服务的 Match.team1_id / team2_id）
ALTER TABLE "Match" ADD COLUMN "teamOneId" INTEGER,
ADD COLUMN "teamTwoId" INTEGER;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamOneId_fkey" FOREIGN KEY ("teamOneId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamTwoId_fkey" FOREIGN KEY ("teamTwoId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
