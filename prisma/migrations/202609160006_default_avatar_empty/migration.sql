-- 头像不再自动分配：默认值改为空字符串，个人主页改为提示用户自行上传。
-- 历史上头像等于旧默认值 /assets/avatars/u2.jpg 的记录都是建号时由默认值自动写入、
-- 并非用户主动选择，因此一并清空，与新行为保持一致。
ALTER TABLE "PlayerProfile" ALTER COLUMN "avatar" SET DEFAULT '';

UPDATE "PlayerProfile" SET "avatar" = '' WHERE "avatar" = '/assets/avatars/u2.jpg';
