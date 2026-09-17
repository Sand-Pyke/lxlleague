-- 个人主页新增「常用英雄」：选手自选最多 3 个英雄，逗号分隔存英雄名。
-- 与战绩推导出的英雄榜分开存，避免把自选偏好和历史数据混在一起。
ALTER TABLE "PlayerProfile"
  ADD COLUMN "favoriteHeroes" TEXT NOT NULL DEFAULT '';
