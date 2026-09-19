/** 轮次语义名称：8 队 → 四分之一决赛 / 半决赛 / 决赛；4 队 → 半决赛 / 决赛。 */
export function roundTitle(roundNo: number, totalRounds: number) {
  const fromFinal = totalRounds - roundNo;
  if (fromFinal === 0) return "决赛";
  if (fromFinal === 1) return "半决赛";
  if (fromFinal === 2) return "四分之一决赛";
  if (fromFinal === 3) return "八分之一决赛";
  return `第 ${roundNo} 轮`;
}
