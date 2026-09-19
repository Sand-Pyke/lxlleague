-- 游戏ID（名称#编号）：名称可重复，但 # 后的数字编号全局唯一。
-- 移除上一版对「整个 gameName」的唯一约束，改为只对编号部分（split_part 取 # 之后）唯一；
-- 不含 # 的旧数据（如管理员遗留的 "admin"）不参与约束。
DROP INDEX IF EXISTS "PlayerProfile_gameName_key";

CREATE UNIQUE INDEX "PlayerProfile_gameTag_key"
  ON "PlayerProfile"(lower(split_part("gameName", '#', 2)))
  WHERE "gameName" LIKE '%#%';
