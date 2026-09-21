-- 报名处罚截止时间：非空且晚于当前时间时禁止该用户报名；null 表示未处罚。
ALTER TABLE "User" ADD COLUMN "banUntil" TIMESTAMP(3);
