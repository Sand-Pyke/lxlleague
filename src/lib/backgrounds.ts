/**
 * 自定义背景白名单（旧项目 /static/bgs 的 8 张图，文件已迁到 public/assets/bgs）。
 * 服务端校验与前端选择弹窗共用，因此不能依赖 Prisma。背景是全站生效的，
 * 只在深色模式下启用；个人主页只是选择入口。
 */

export const BACKGROUND_PREFIX = "/assets/bgs/";

export const BACKGROUND_OPTIONS = [
  { file: "02_kasa_4k.jpg", label: "卡莎·4K" },
  { file: "03_ahri_guofeng.jpg", label: "阿狸·国风" },
  { file: "04_ahri_4k.jpg", label: "拉克丝·4K" },
  { file: "05_riven_yujian.jpg", label: "锐雯·玉剑" },
  { file: "06_riven_classic.jpg", label: "永恩·经典" },
  { file: "07_yasuo_preview.jpg", label: "亚索·预知" },
  { file: "08_yasuo_project.jpg", label: "亚索·源计划" },
  { file: "09_zed.jpg", label: "劫·暗影" },
] as const;

export const BACKGROUND_FILES: readonly string[] = BACKGROUND_OPTIONS.map((item) => item.file);

export const isBackgroundFile = (file: string) => BACKGROUND_FILES.includes(file);
