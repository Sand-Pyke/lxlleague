-- 段位词汇与旧服务对齐：旧库中段位取值为中文（黑铁~王者），未设置用空字符串表示，
-- 费用表 rank_fee 也只识别这套中文值。此前默认值写成了 'UNRANKED'，既不在词表内，
-- 也让报名费用 / 队伍预算恒为 0，故统一回空字符串并归一化历史数据。
ALTER TABLE "PlayerProfile" ALTER COLUMN "rank" SET DEFAULT '';
ALTER TABLE "MatchSignup" ALTER COLUMN "rankAtSignup" SET DEFAULT '';

UPDATE "PlayerProfile" SET "rank" = '' WHERE "rank" = 'UNRANKED';
UPDATE "MatchSignup" SET "rankAtSignup" = '' WHERE "rankAtSignup" = 'UNRANKED';
