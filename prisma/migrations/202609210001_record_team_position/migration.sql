-- 保存每局的实际位置。第七个装备栏仅用于 ADC，因此不能依赖会变化的报名位置。
ALTER TABLE "MatchGameRecord"
  ADD COLUMN "teamPosition" TEXT NOT NULL DEFAULT '';

-- 已有赛事按当前已确认的报名位置回填；以后记录会在写入时固定该值。
UPDATE "MatchGameRecord" AS record
SET "teamPosition" = signup."teamPosition"
FROM "MatchSignup" AS signup
WHERE record."matchId" = signup."matchId"
  AND record."userId" = signup."userId"
  AND record."teamPosition" = ''
  AND signup."teamPosition" IN ('TOP', 'JUG', 'MID', 'ADC', 'SUP');
