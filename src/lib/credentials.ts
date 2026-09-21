/**
 * 账户ID（登录名）与密码的字符集策略。
 *
 * 账户ID 只允许 ASCII 字母 / 数字 / 下划线：中文、全角字符、空格、引号等一律拒绝。
 * 注册、修改账户ID、登录校验三处共用同一份规则，避免各写一份后逐渐漂移
 * （历史上注册与「修改账户ID」的规则就不一致，中文账户ID只在前者被拦住一半）。
 *
 * 登录侧故意比注册宽松一点（只拦非 ASCII 与空格，不套用完整正则）：
 * 老账号可能带 `.` / `-` 之类字符，收紧后要保证它们仍能登录。
 */

export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 24;

/** 注册 / 改账户ID 用的严格规则。 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{2,24}$/;

export const USERNAME_HINT = "仅限字母、数字、下划线（2-24 个字符）";

export const USERNAME_INVALID_MESSAGE = `账户ID只能包含字母、数字、下划线，${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} 个字符`;

/** 登录时禁止出现的字符：可打印 ASCII（\x21-\x7e）之外的一切，含中文、全角符号与空格。 */
const FORBIDDEN_USERNAME_CHARS = /[^\x21-\x7e]/;

/** 登录校验：返回错误文案，合法返回 null。 */
export function usernameCharsetError(username: string): string | null {
  if (FORBIDDEN_USERNAME_CHARS.test(username)) {
    return "账户ID不能包含中文、空格或特殊字符，只能使用字母、数字、下划线";
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return `账户ID不能超过 ${USERNAME_MAX_LENGTH} 个字符`;
  }
  return null;
}

/** 注册 / 改账户ID 校验：返回错误文案，合法返回 null。 */
export function usernameFormatError(username: string): string | null {
  if (!username) return "请输入账户ID";
  if (FORBIDDEN_USERNAME_CHARS.test(username)) {
    return "账户ID不能包含中文、空格或特殊字符，只能使用字母、数字、下划线";
  }
  if (!USERNAME_PATTERN.test(username)) return USERNAME_INVALID_MESSAGE;
  return null;
}

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 64;

export const PASSWORD_HINT = "6-64 个字符，仅限字母、数字与英文符号";

export const PASSWORD_INVALID_MESSAGE = `密码需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 个字符，仅限字母、数字与英文符号（不支持中文与空格）`;

/** 可打印 ASCII、不含空格：把中文与全角字符挡在密码之外。 */
const PASSWORD_PATTERN = /^[\x21-\x7e]{6,64}$/;

/** 密码校验（注册与自助改密共用）：返回错误文案，合法返回 null。 */
export function passwordFormatError(password: string): string | null {
  if (!password) return "请输入密码";
  if (!PASSWORD_PATTERN.test(password)) return PASSWORD_INVALID_MESSAGE;
  return null;
}
