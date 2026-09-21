-- 赛事排期时间改为可空：未设置时首页「今日赛事」显示「时间待定」。
ALTER TABLE "Match" ALTER COLUMN "date" DROP NOT NULL;
