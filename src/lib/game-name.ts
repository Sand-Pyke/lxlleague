/**
 * 游戏ID（召唤师名）格式：名称#数字编号，例如「众生皆我#32250」。
 *
 * 名称部分只允许中文 / 英文字母 / 数字（不允许空格与任何符号），
 * 编号部分是 3-6 位数字。名称可以重复，但 # 后的数字编号全局唯一
 * （由数据库对 split_part(gameName, '#', 2) 的部分唯一索引保证）。
 * 注册时不再把账户名自动带入游戏ID，必须由选手按游戏内昵称自己填写，
 * 这里与 account.ts 的服务端校验共用同一份规则。
 */

/** 名称部分：1-16 位中文 / 英文字母 / 数字。 */
export const GAME_NAME_BASE_PATTERN = /^[\u4e00-\u9fa5\u3400-\u4dbfA-Za-z0-9]{1,16}$/;

/** 编号部分：3-6 位数字。 */
export const GAME_TAG_PATTERN = /^\d{3,6}$/;

/** 完整游戏ID：名称#数字编号。 */
export const GAME_NAME_PATTERN = /^[\u4e00-\u9fa5\u3400-\u4dbfA-Za-z0-9]{1,16}#\d{3,6}$/;

/** 游戏ID填写提示（个人资料弹窗与校验失败文案共用）。 */
export const GAME_NAME_HINT =
  "名称#数字编号，例如 向阳而生#32250（名称 1-16 位中文/英文/数字，编号 3-6 位数字）";

export function isValidGameName(value: string | null | undefined) {
  return GAME_NAME_PATTERN.test((value ?? "").trim());
}

export function isValidGameNameBase(name: string) {
  return GAME_NAME_BASE_PATTERN.test(name);
}

export function isValidGameTag(tag: string) {
  return GAME_TAG_PATTERN.test(tag);
}

/** 取 # 之后的数字编号（无 # 时返回空串）。 */
export function gameTagOf(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  const hash = text.indexOf("#");
  return hash < 0 ? "" : text.slice(hash + 1);
}

/** 把完整游戏ID拆成 { name, tag }，供「名称 + 固定 # + 编号」的表单回填使用。 */
export function splitGameName(value: string | null | undefined): { name: string; tag: string } {
  const text = (value ?? "").trim();
  const hash = text.indexOf("#");
  if (hash < 0) return { name: text, tag: "" };
  return { name: text.slice(0, hash), tag: text.slice(hash + 1) };
}
