-- 对局战绩表（MatchGameRecord）成为胜场 / KDA / MVP 的唯一数据源。
-- PlayerProfile 上重复维护的统计列无法随战绩写入保持同步，会在选手页与排行页
-- 显示与赛果不一致的数字，因此直接移除。
ALTER TABLE "PlayerProfile"
  DROP COLUMN "wins",
  DROP COLUMN "losses",
  DROP COLUMN "kda",
  DROP COLUMN "mvp";

-- 位置只在 mainPosition / subPosition 上维护，移除语义重复的 position。
ALTER TABLE "PlayerProfile" DROP COLUMN "position";

-- 战绩允许挂在「自由对局」上（对应原服务的 match_id = 0），
-- 因此 matchId 需要可空；删除赛事时由应用层显式清理该赛事下的战绩。
ALTER TABLE "MatchGameRecord" ALTER COLUMN "matchId" DROP NOT NULL;
ALTER TABLE "MatchGameRecord" DROP CONSTRAINT "MatchGameRecord_matchId_fkey";
ALTER TABLE "MatchGameRecord" ADD CONSTRAINT "MatchGameRecord_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;
