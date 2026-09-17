/**
 * 默认表情头像白名单。
 *
 * 这些 SVG 由 scripts/build-default-avatars.mjs 生成（素材来自 Twemoji，图形 CC-BY 4.0，
 * 归属见 public/assets/avatars/default/README.md），已提交到仓库并作为静态资源随镜像发布。
 * 服务端校验与前端选择弹窗共用，因此这里不能依赖 Prisma。
 *
 * 存库时保存的是完整路径（/assets/avatars/default/emoji-01.svg），
 * 与上传头像 /assets/avatars/u<id>_<ts>.png 保持同一种形态，渲染层无需区分。
 */

export const DEFAULT_AVATAR_PREFIX = "/assets/avatars/default/";

export const DEFAULT_AVATAR_OPTIONS = [
  { id: "emoji-01", label: "微笑" },
  { id: "emoji-02", label: "墨镜" },
  { id: "emoji-03", label: "小丑" },
  { id: "emoji-04", label: "幽灵" },
  { id: "emoji-05", label: "猫咪" },
  { id: "emoji-06", label: "小狗" },
  { id: "emoji-07", label: "狐狸" },
  { id: "emoji-08", label: "熊猫" },
  { id: "emoji-09", label: "青蛙" },
  { id: "emoji-10", label: "猴子" },
  { id: "emoji-11", label: "狮子" },
  { id: "emoji-12", label: "老虎" },
  { id: "emoji-13", label: "巨龙" },
  { id: "emoji-14", label: "独角兽" },
  { id: "emoji-15", label: "企鹅" },
  { id: "emoji-16", label: "考拉" },
  { id: "emoji-17", label: "兔子" },
  { id: "emoji-18", label: "小熊" },
  { id: "emoji-19", label: "猫头鹰" },
  { id: "emoji-20", label: "章鱼" },
  { id: "emoji-21", label: "机器人" },
  { id: "emoji-22", label: "外星人" },
  { id: "emoji-23", label: "皇冠" },
  { id: "emoji-24", label: "火箭" },
] as const;

export const DEFAULT_AVATAR_IDS: readonly string[] = DEFAULT_AVATAR_OPTIONS.map((item) => item.id);

export const defaultAvatarPath = (id: string) => `${DEFAULT_AVATAR_PREFIX}${id}.svg`;

/** 注册时随机发一个默认头像，用户之后可以在「我的资料」里换掉或上传自己的图。 */
export const randomDefaultAvatar = () =>
  defaultAvatarPath(DEFAULT_AVATAR_IDS[Math.floor(Math.random() * DEFAULT_AVATAR_IDS.length)]);

/** 同时接受 id（emoji-07）与完整路径（/assets/avatars/default/emoji-07.svg）。 */
export const isDefaultAvatar = (value: string) =>
  DEFAULT_AVATAR_IDS.includes(value) ||
  (value.startsWith(DEFAULT_AVATAR_PREFIX) &&
    DEFAULT_AVATAR_IDS.includes(value.slice(DEFAULT_AVATAR_PREFIX.length).replace(/\.svg$/, "")));

/** 统一成入库用的完整路径；不属于白名单则返回 null。 */
export const normalizeDefaultAvatar = (value: string) => {
  if (!isDefaultAvatar(value)) return null;
  const id = value.startsWith(DEFAULT_AVATAR_PREFIX)
    ? value.slice(DEFAULT_AVATAR_PREFIX.length).replace(/\.svg$/, "")
    : value;
  return defaultAvatarPath(id);
};
