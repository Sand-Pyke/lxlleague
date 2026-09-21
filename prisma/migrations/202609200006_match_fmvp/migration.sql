-- 今日 FMVP：给赛事增加可选的 FMVP 选手（从已编排队伍的参赛选手中选择）。
ALTER TABLE "Match" ADD COLUMN "fmvpUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_fmvpUserId_fkey" FOREIGN KEY ("fmvpUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
