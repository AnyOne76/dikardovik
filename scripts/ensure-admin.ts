/**
 * Создаёт администратора из SEED_ADMIN_* только если в БД ещё нет ни одного пользователя с role=admin.
 * Безопасно вызывать при каждом старте контейнера (не сбрасывает пароль существующего админа).
 */
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (existingAdmin) {
    console.log(`Admin already present: ${existingAdmin.login}`);
    return;
  }

  const login = process.env.SEED_ADMIN_LOGIN ?? "hr-admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { login },
    update: { passwordHash: hash, role: "admin" },
    create: { login, passwordHash: hash, role: "admin" },
  });

  console.log(`Ensured admin user: ${login} (no admin existed before)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
