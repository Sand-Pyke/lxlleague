-- 游戏ID（召唤师名）全局唯一：非空昵称不区分大小写，空串「未设置」不参与约束。
CREATE UNIQUE INDEX "PlayerProfile_gameName_key"
  ON "PlayerProfile"(lower("gameName"))
  WHERE "gameName" <> '';
