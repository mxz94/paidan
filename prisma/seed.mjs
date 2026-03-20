import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureColumn(tableName, columnDDL) {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" ADD COLUMN ${columnDDL};`);
  } catch {
    // Ignore when the column already exists.
  }
}

async function ensureSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Role" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Role_code_key" ON "Role"("code");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_key" ON "Role"("name");`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Menu" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "key" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "path" TEXT NOT NULL,
      "icon" TEXT,
      "sort" INTEGER NOT NULL DEFAULT 0,
      "parentId" INTEGER,
      CONSTRAINT "Menu_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Menu" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Menu_key_key" ON "Menu"("key");`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "username" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "displayName" TEXT NOT NULL,
      "roleId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");`);
  await ensureColumn("User", `"longitude" REAL`);
  await ensureColumn("User", `"latitude" REAL`);
  await ensureColumn("User", `"locationAt" DATETIME`);
  await ensureColumn("User", `"accessMode" TEXT NOT NULL DEFAULT 'BACKEND'`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RoleMenu" (
      "roleId" INTEGER NOT NULL,
      "menuId" INTEGER NOT NULL,
      PRIMARY KEY ("roleId", "menuId"),
      CONSTRAINT "RoleMenu_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "RoleMenu_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Package" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "price" REAL NOT NULL,
      "description" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Package_code_key" ON "Package"("code");`);
  await ensureColumn("Package", `"isDefault" BOOLEAN NOT NULL DEFAULT false`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DispatchOrder" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "title" TEXT NOT NULL,
      "region" TEXT NOT NULL,
      "address" TEXT NOT NULL,
      "longitude" REAL,
      "latitude" REAL,
      "phone" TEXT NOT NULL,
      "customerType" TEXT NOT NULL,
      "remark" TEXT,
      "photoUrl" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "createdById" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DispatchOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DispatchOrder_createdById_idx" ON "DispatchOrder"("createdById");`,
  );
  await ensureColumn("DispatchOrder", `"packageId" INTEGER`);
  await ensureColumn("DispatchOrder", `"claimedById" INTEGER`);
  await ensureColumn("DispatchOrder", `"claimedAt" DATETIME`);
  await ensureColumn("DispatchOrder", `"isDeleted" BOOLEAN NOT NULL DEFAULT false`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DispatchOrder_packageId_idx" ON "DispatchOrder"("packageId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DispatchOrder_claimedById_idx" ON "DispatchOrder"("claimedById");`,
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DispatchOrderRecord" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "orderId" INTEGER NOT NULL,
      "operatorId" INTEGER NOT NULL,
      "actionType" TEXT NOT NULL,
      "remark" TEXT,
      "photoUrl" TEXT,
      "operatorLongitude" REAL,
      "operatorLatitude" REAL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DispatchOrderRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DispatchOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "DispatchOrderRecord_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);
  await ensureColumn("DispatchOrderRecord", `"operatorLongitude" REAL`);
  await ensureColumn("DispatchOrderRecord", `"operatorLatitude" REAL`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DispatchOrderRecord_orderId_idx" ON "DispatchOrderRecord"("orderId");`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "DispatchOrderRecord_operatorId_idx" ON "DispatchOrderRecord"("operatorId");`,
  );
}

async function main() {
  await ensureSchema();

  const menus = [
    { key: "dashboard", name: "仪表盘", path: "/dashboard", icon: "home", sort: 1 },
    { key: "dispatch-order", name: "单据管理", path: "/dashboard/orders", icon: "send", sort: 2 },
    { key: "perm-order-dispatch-assign", name: "单据管理-派单按钮", path: "#", icon: "key", sort: 201 },
    { key: "perm-order-delete-btn", name: "单据管理-删除按钮", path: "#", icon: "key", sort: 202 },
    { key: "user-manage", name: "用户管理", path: "/dashboard/users", icon: "users", sort: 3 },
    { key: "package-manage", name: "套餐管理", path: "/dashboard/packages", icon: "box", sort: 4 },
    { key: "role-menu", name: "角色管理", path: "/dashboard/role-menus", icon: "shield", sort: 5 },
    { key: "system-config", name: "参数配置", path: "/dashboard/settings", icon: "settings", sort: 6 },
  ];

  for (const menu of menus) {
    await prisma.menu.upsert({
      where: { key: menu.key },
      create: menu,
      update: menu,
    });
  }

  const dispatchOrderMenu = await prisma.menu.findUnique({
    where: { key: "dispatch-order" },
    select: { id: true },
  });
  if (dispatchOrderMenu) {
    await prisma.menu.updateMany({
      where: { key: { in: ["perm-order-dispatch-assign", "perm-order-delete-btn"] } },
      data: { parentId: dispatchOrderMenu.id },
    });
  }

  const adminRole = await prisma.role.upsert({
    where: { code: "ADMIN" },
    create: { code: "ADMIN", name: "管理员" },
    update: { name: "管理员" },
  });

  const userRole = await prisma.role.upsert({
    where: { code: "USER" },
    create: { code: "USER", name: "普通用户" },
    update: { name: "普通用户" },
  });

  const allMenus = await prisma.menu.findMany({ orderBy: { sort: "asc" } });

  await prisma.roleMenu.deleteMany({ where: { roleId: adminRole.id } });
  await prisma.roleMenu.createMany({
    data: allMenus.map((menu) => ({ roleId: adminRole.id, menuId: menu.id })),
  });

  const userMenus = allMenus.filter((item) => ["dashboard", "dispatch-order"].includes(item.key));
  if (userMenus.length > 0) {
    await prisma.roleMenu.deleteMany({ where: { roleId: userRole.id } });
    await prisma.roleMenu.createMany({
      data: userMenus.map((item) => ({ roleId: userRole.id, menuId: item.id })),
    });
  }

  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    create: {
      username: "admin",
      passwordHash: adminPasswordHash,
      displayName: "系统管理员",
      accessMode: "BACKEND",
      roleId: adminRole.id,
    },
    update: {
      passwordHash: adminPasswordHash,
      displayName: "系统管理员",
      accessMode: "BACKEND",
      roleId: adminRole.id,
    },
  });

  const mobilePasswordHash = await bcrypt.hash("123456", 10);
  await prisma.user.upsert({
    where: { username: "mobile" },
    create: {
      username: "mobile",
      passwordHash: mobilePasswordHash,
      displayName: "移动调度员",
      accessMode: "MOBILE",
      roleId: userRole.id,
    },
    update: {
      passwordHash: mobilePasswordHash,
      displayName: "移动调度员",
      accessMode: "MOBILE",
      roleId: userRole.id,
    },
  });

  const seedPackages = [
    {
      code: "BASIC_99",
      name: "基础套餐",
      price: 99,
      description: "适合小团队的基础派单能力",
      isActive: true,
      isDefault: true,
    },
    {
      code: "PRO_299",
      name: "专业套餐",
      price: 299,
      description: "包含高级报表与权限细分能力",
      isActive: true,
      isDefault: false,
    },
  ];

  for (const pkg of seedPackages) {
    await prisma.package.upsert({
      where: { code: pkg.code },
      create: pkg,
      update: pkg,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
