/**
 * 自选常用英雄：库里存成逗号分隔的英雄名（与后台战绩录入的英雄名同一套写法），
 * 最多 3 个，顺序即选手填写的顺序。
 */
export const MAX_FAVORITE_HEROES = 3;

export function parseFavoriteHeroes(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, MAX_FAVORITE_HEROES);
}

export function formatFavoriteHeroes(heroes: readonly string[]): string {
  return heroes.join(",");
}
