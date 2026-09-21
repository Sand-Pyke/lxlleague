-- LCU 自动导入的目标赛事：管理员在后台点选，导入上下文据此定位写入目标，
-- 而不是按 id 倒序去猜。多场已结束的赛事并存时也能明确指向其中一场。
ALTER TABLE "Match"
  ADD COLUMN "importTarget" BOOLEAN NOT NULL DEFAULT false;
