-- 段位改为「注册时可选提交、审核通过后锁定」：
-- 用户要改段位必须提交申请，账号重新进入 PENDING 并带上备注，
-- 新段位先落在 pendingRank 里，等管理员通过后才写入 PlayerProfile.rank。
ALTER TABLE "User"
  ADD COLUMN "reviewNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "pendingRank" TEXT NOT NULL DEFAULT '';
