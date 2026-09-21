-- 队伍顺位：决定对战配对顺序（越小越靠前），可拖拽重排。
ALTER TABLE "Team" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- 现有队伍按创建顺序初始化顺位。
UPDATE "Team" SET "sortOrder" = "id";
