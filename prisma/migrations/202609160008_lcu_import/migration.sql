-- 自动导入战绩（LCU agent）所需的两处支撑：
--  1. PlayerProfile.puuid —— 昵称可改、Riot ID 格式也变过，只有 puuid 能稳定对到人；
--  2. MatchGameRecord.sourceGameId —— 存 LCU 的 gameId，配合 userId 做幂等，
--     避免 agent 重复抓到同一局时刷出重复记录。
--
-- sourceGameId 刻意设计成**可空**：手工录入不传就是 NULL，而 Postgres 的唯一索引
-- 把多个 NULL 视为互不相同，所以手工录入的同一玩家多条记录不会互相冲突；
-- 自动导入带上真实 gameId 后即获得（来源对局, 玩家）级别的幂等。
-- 这样索引是**完整**的（不是 partial），Prisma 的 upsert 生成的
-- ON CONFLICT ("sourceGameId","userId") 才能命中它。

ALTER TABLE "PlayerProfile"
  ADD COLUMN "puuid" TEXT NOT NULL DEFAULT '';

ALTER TABLE "MatchGameRecord"
  ADD COLUMN "sourceGameId" TEXT;

CREATE UNIQUE INDEX "MatchGameRecord_sourceGameId_userId_key"
  ON "MatchGameRecord" ("sourceGameId", "userId");
