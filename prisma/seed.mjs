import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD;

if (!password || password.length < 12) {
  console.error(
    "ADMIN_PASSWORD must contain at least 12 characters before the initial administrator can be created.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  await prisma.user.upsert({
    where: { username },
    update: { isAdmin: true, status: "APPROVED", passwordHash: await bcrypt.hash(password, 12) },
    create: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      isAdmin: true,
      status: "APPROVED",
      // 游戏ID 必须由选手按游戏内昵称填写（名称#数字），系统账号不预置虚假的游戏ID。
      profile: { create: { name: username, gameName: "" } },
    },
  });
  console.log(`Administrator ${username} is ready.`);
} finally {
  await prisma.$disconnect();
}
