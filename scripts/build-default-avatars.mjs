/**
 * 生成注册默认头像（表情头像）。
 *
 * 用法：npm run assets:default-avatars
 *
 * 素材取自 Twemoji（https://github.com/jdecked/twemoji，图形 CC-BY 4.0），
 * 本项目只把表情矢量图叠在一个 128×128 的渐变圆底上，生成
 * public/assets/avatars/default/emoji-NN.svg。生成结果已提交进仓库，
 * 因此构建与运行期都不需要联网；只有改表情清单或配色时才需要重新跑一次。
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = "https://raw.githubusercontent.com/jdecked/twemoji/main/assets/svg";
const OUT_DIR = path.join(process.cwd(), "public", "assets", "avatars", "default");

/** 画布边长与表情占画布的比例：留出渐变圆底的边，缩到小头像也认得出。 */
const CANVAS = 128;
const GLYPH_RATIO = 0.74;

/** 表情清单：id 决定文件名，label 是选择器里的中文名，code 是 Twemoji 的文件名（码点）。 */
const EMOJI = [
  { id: "emoji-01", label: "微笑", code: "1f600", from: "#5b7cfa", to: "#7ee0ff" },
  { id: "emoji-02", label: "墨镜", code: "1f60e", from: "#f97316", to: "#fde68a" },
  { id: "emoji-03", label: "小丑", code: "1f921", from: "#8b5cf6", to: "#e9a3ff" },
  { id: "emoji-04", label: "幽灵", code: "1f47b", from: "#22d3ee", to: "#a5f3fc" },
  { id: "emoji-05", label: "猫咪", code: "1f431", from: "#fb7185", to: "#fecdd3" },
  { id: "emoji-06", label: "小狗", code: "1f436", from: "#f59e0b", to: "#fcd34d" },
  { id: "emoji-07", label: "狐狸", code: "1f98a", from: "#ef4444", to: "#fb923c" },
  { id: "emoji-08", label: "熊猫", code: "1f43c", from: "#0ea5e9", to: "#bae6fd" },
  { id: "emoji-09", label: "青蛙", code: "1f438", from: "#22c55e", to: "#bef264" },
  { id: "emoji-10", label: "猴子", code: "1f435", from: "#14b8a6", to: "#67e8f9" },
  { id: "emoji-11", label: "狮子", code: "1f981", from: "#d97706", to: "#fbbf24" },
  { id: "emoji-12", label: "老虎", code: "1f42f", from: "#ea580c", to: "#fdba74" },
  { id: "emoji-13", label: "巨龙", code: "1f432", from: "#2563eb", to: "#38bdf8" },
  { id: "emoji-14", label: "独角兽", code: "1f984", from: "#a855f7", to: "#f0abfc" },
  { id: "emoji-15", label: "企鹅", code: "1f427", from: "#0369a1", to: "#7dd3fc" },
  { id: "emoji-16", label: "考拉", code: "1f428", from: "#64748b", to: "#cbd5e1" },
  { id: "emoji-17", label: "兔子", code: "1f430", from: "#f472b6", to: "#fbcfe8" },
  { id: "emoji-18", label: "小熊", code: "1f43b", from: "#b45309", to: "#fcd34d" },
  { id: "emoji-19", label: "猫头鹰", code: "1f989", from: "#7c3aed", to: "#a78bfa" },
  { id: "emoji-20", label: "章鱼", code: "1f419", from: "#be185d", to: "#f472b6" },
  { id: "emoji-21", label: "机器人", code: "1f916", from: "#0f766e", to: "#5eead4" },
  { id: "emoji-22", label: "外星人", code: "1f47d", from: "#4f46e5", to: "#818cf8" },
  { id: "emoji-23", label: "皇冠", code: "1f451", from: "#b45309", to: "#fde047" },
  { id: "emoji-24", label: "火箭", code: "1f680", from: "#1d4ed8", to: "#60a5fa" },
];

const round = (value) => Number(value.toFixed(4));

/** 把 Twemoji 的 svg 拆成 viewBox + 内容，再套上渐变圆底并居中缩放。 */
function compose(source, { code, from, to }) {
  const viewBox = source.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 36 36";
  const [minX, minY, width, height] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (![minX, minY, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`${code}: 无法解析 viewBox（${viewBox}）`);
  }
  const inner = source
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();
  if (!inner) throw new Error(`${code}: svg 内容为空`);

  const scale = (CANVAS * GLYPH_RATIO) / Math.max(width, height);
  const translateX = round((CANVAS - width * scale) / 2 - minX * scale);
  const translateY = round((CANVAS - height * scale) / 2 - minY * scale);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${from}"/>`,
    `<stop offset="1" stop-color="${to}"/>`,
    `</linearGradient></defs>`,
    `<circle cx="${CANVAS / 2}" cy="${CANVAS / 2}" r="${CANVAS / 2}" fill="url(#bg)"/>`,
    `<g transform="translate(${translateX} ${translateY}) scale(${round(scale)})">${inner}</g>`,
    `</svg>`,
  ].join("");
}

async function download(code) {
  const url = `${SOURCE}/${code}.svg`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${code}: 下载失败（${lastError?.message ?? "未知错误"}）`);
}

await mkdir(OUT_DIR, { recursive: true });
let total = 0;
for (const item of EMOJI) {
  const svg = compose(await download(item.code), item);
  const file = path.join(OUT_DIR, `${item.id}.svg`);
  await writeFile(file, svg, "utf8");
  total += Buffer.byteLength(svg);
  console.log(`${item.id}.svg  ${item.label}`);
}
console.log(`\n共生成 ${EMOJI.length} 个头像，合计 ${(total / 1024).toFixed(1)} KB → ${OUT_DIR}`);
