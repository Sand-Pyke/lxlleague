/**
 * 游戏ID（召唤师名）格式：名称#数字编号，例如「众生皆我#32250」。
 *
 * 名称部分只允许中文 / 英文字母 / 数字（不允许空格与任何符号），
 * 编号部分是 3-6 位数字。注册时不再把账户名自动带入游戏ID，
 * 必须由选手按游戏内昵称自己填写，这里与 account.ts 的服务端校验共用同一份规则。
 */
export const GAME_NAME_PATTERN = /^[\u4e00-\u9fa5\u3400-\u4dbfA-Za-z0-9]{1,16}#\d{3,6}$/;

/** 游戏ID填写提示（个人资料弹窗与校验失败文案共用）。 */
export const GAME_NAME_HINT = "名称#数字编号，例如 向阳而生#32250（名称仅限中文/字母/数字）";

export function isValidGameName(value: string | null | undefined) {
  return GAME_NAME_PATTERN.test((value ?? "").trim());
}
