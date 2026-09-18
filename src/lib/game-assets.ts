/**
 * 英雄 / 装备的本地图标资源映射。
 *
 * 旧项目用 /static/champions.json、/static/items.json 在浏览器端查表，
 * 这里直接复用 public/assets 下的同两个文件（静态 import），
 * 这样服务端组件与客户端组件都能同步查表，不需要额外的 fetch 与首屏闪烁。
 */

import championData from "../../public/assets/champions.json";
import itemData from "../../public/assets/items.json";

export type ChampionAsset = {
  id: string;
  /** 中文称号，如「黑暗之女」 */
  name: string;
  /** 英雄名，如「安妮」 */
  title: string;
  /** 英文别名，如「Annie」，图标文件名即取自它 */
  alias: string;
  img: string;
};

export type ItemAsset = {
  id: string;
  name: string;
  /** 图标路径；个别装备没有图标文件，此时为空字符串 */
  img: string;
};

const champions = championData as ChampionAsset[];
const items = itemData as ItemAsset[];

const normalize = (value: string) => value.trim().toLowerCase();

const championIndex = new Map<string, ChampionAsset>();
for (const champion of champions) {
  for (const key of [champion.name, champion.title, champion.alias]) {
    const normalized = normalize(key || "");
    if (normalized && !championIndex.has(normalized)) championIndex.set(normalized, champion);
  }
}

const championById = new Map<string, ChampionAsset>();
for (const champion of champions) championById.set(String(champion.id), champion);

const itemById = new Map<string, ItemAsset>();
const itemByName = new Map<string, ItemAsset>();
for (const item of items) {
  itemById.set(item.id, item);
  itemByName.set(normalize(item.name), item);
}

/** 按中文称号 / 英雄名 / 英文别名查英雄（战绩里的英雄是自由文本，与旧项目一致）。 */
export function championAsset(name: string | null | undefined) {
  if (!name) return null;
  return championIndex.get(normalize(name)) ?? null;
}

/** 英雄头像地址，查不到时返回空串。 */
export function championIcon(name: string | null | undefined) {
  return championAsset(name)?.img ?? "";
}

/** 装备既可能存成 id（旧数据），也可能被填成名称，两种都认。 */
export function itemAsset(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const key = String(value).trim();
  if (!key) return null;
  return itemById.get(key) ?? itemByName.get(normalize(key)) ?? null;
}

/** 装备图标地址，查不到或没有图标文件时返回空串。 */
export function itemIcon(value: string | number | null | undefined) {
  return itemAsset(value)?.img ?? "";
}

/** 把界面上填写的装备转换成落库用的 id（旧项目同样以 id 存库）。 */
export function itemIdFromInput(value: string) {
  const key = value.trim();
  if (!key) return "";
  if (itemById.has(key)) return key;
  return itemByName.get(normalize(key))?.id ?? "";
}

/** 经济显示：15330 → 15.33k（千位转 k，去尾零），与旧 fmtGold 一致。 */
export function formatGold(value: number | string | null | undefined) {
  const amount = Number.parseInt(String(value ?? 0), 10) || 0;
  if (amount >= 1000) return `${(amount / 1000).toFixed(2).replace(/\.?0+$/, "")}k`;
  return String(amount);
}

/** 英雄输入框的联想列表（旧项目用 h.name 作为 datalist 选项）。 */
export const championOptions = champions.map((champion) => champion.name);

export type ChampionChoice = {
  /** 落库用的英雄名（中文称号，与战绩录入的英雄名同一套写法）。 */
  value: string;
  label: string;
  /** 搜索关键词：中文称号 + 英雄名 + 英文别名。 */
  keywords: string;
  icon: string;
};

/** 「常用英雄」选择器候选项；同名的英雄只保留一条，避免选择器出现重复项。 */
const championChoiceSeen = new Set<string>();
export const championChoices: ChampionChoice[] = champions.reduce<ChampionChoice[]>(
  (choices, champion) => {
    if (!champion.name || championChoiceSeen.has(champion.name)) return choices;
    championChoiceSeen.add(champion.name);
    choices.push({
      value: champion.name,
      label: champion.title ? `${champion.name} · ${champion.title}` : champion.name,
      keywords: [champion.name, champion.title, champion.alias].filter(Boolean).join(" "),
      icon: champion.img,
    });
    return choices;
  },
  [],
);

/** 把英雄名（称号 / 英雄名 / 英文别名都认）统一成落库用的中文称号。 */
export function canonicalChampionName(name: string | null | undefined) {
  return championAsset(name)?.name ?? (name ?? "").trim();
}

/** 按 Riot championId（如 "75"）查中文称号；查不到返回空串。 */
export function championNameById(id: string | number | null | undefined) {
  const key = String(id ?? "").trim();
  if (!key) return "";
  return championById.get(key)?.name ?? "";
}

/** 装备输入框的联想列表。 */
export const itemOptions = items.map((item) => item.name);
