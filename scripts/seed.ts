import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const login = process.env.SEED_ADMIN_LOGIN ?? "hr-admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { login },
    update: { passwordHash: hash, role: "admin" },
    create: { login, passwordHash: hash, role: "admin" },
  });
  console.log(`Seeded admin user: ${login}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
