import { hasRealPosition } from "@/lib/admin-options";
import { GAME_NAME_HINT, isValidGameName } from "@/lib/game-name";

/**
 * 报名赛事前必须补全的资料项。服务端（报名接口）与前端（个人主页提示、
 * 赛事页按钮）共用这一份判定，避免两边口径不一致。
 */
export type SignupProfileFields = {
  gameName: string;
  mainPosition: string;
  rank: string;
  kookName: string;
};

/** 返回尚未补全的资料项文案；空数组表示资料完善、可以报名。 */
export function missingSignupRequirements(profile: SignupProfileFields): string[] {
  const missing: string[] = [];
  if (!isValidGameName(profile.gameName)) missing.push(`游戏ID（${GAME_NAME_HINT}）`);
  if (!hasRealPosition(profile.mainPosition)) missing.push("主位置");
  if (!(profile.rank ?? "").trim()) missing.push("段位");
  if (!(profile.kookName ?? "").trim()) missing.push("KOOK昵称");
  return missing;
}
