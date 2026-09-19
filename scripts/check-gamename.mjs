import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rows = await prisma.playerProfile.findMany({ select: { userId: true, gameName: true } });
const byTag = new Map();
const dupes = [];
let empty = 0;
let noHash = 0;

for (const row of rows) {
  const name = (row.gameName ?? "").trim();
  if (!name) {
    empty += 1;
    continue;
  }
  const hash = name.indexOf("#");
  if (hash < 0) {
    noHash += 1;
    console.log("无 # 的游戏ID:", JSON.stringify(name), "用户:", row.userId);
    continue;
  }
  const tag = name.slice(hash + 1).toLowerCase();
  if (byTag.has(tag)) {
    dupes.push({ tag, userIds: [byTag.get(tag), row.userId] });
  } else {
    byTag.set(tag, row.userId);
  }
}

console.log(`总资料数: ${rows.length}  空昵称: ${empty}  无#编号: ${noHash}  编号重复组: ${dupes.length}`);
for (const d of dupes) console.log("编号重复:", d.tag, "用户:", d.userIds.join(", "));

await prisma.$disconnect();
