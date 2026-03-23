import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureColumn(tableName, columnDDL) {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" ADD COLUMN ${columnDDL};`);
  } catch {
    // ignore if exists
  }
}

async function ensureSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Tenant" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_code_key" ON "Tenant"("code");`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Role" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL
    );
  `);
  await ensureColumn("Role", `"tenantId" INTEGER`);
  await ensureColumn("Role", `"isBuiltin" BOOLEAN NOT NULL DEFAULT false`);
  await ensureColumn("Role", `"dataScope" TEXT NOT NULL DEFAULT 'TENANT'`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Role_code_key" ON "Role"("code");`);
  try {
    await prisma.$executeRawUnsafe(`DROP INDEX "Role_name_key";`);
  } catch {}
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Role_tenantId_idx" ON "Role"("tenantId");`);

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
      "tenantId" INTEGER,
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
  await ensureColumn("User", `"tenantId" INTEGER`);
  await ensureColumn("User", `"storeId" INTEGER`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "User_storeId_idx" ON "User"("storeId");`);

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
      "tenantId" INTEGER,
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
  await ensureColumn("Package", `"tenantId" INTEGER`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Package_tenantId_idx" ON "Package"("tenantId");`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DispatchOrder" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "tenantId" INTEGER,
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
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchOrder_createdById_idx" ON "DispatchOrder"("createdById");`);
  await ensureColumn("DispatchOrder", `"packageId" INTEGER`);
  await ensureColumn("DispatchOrder", `"claimedById" INTEGER`);
  await ensureColumn("DispatchOrder", `"claimedAt" DATETIME`);
  await ensureColumn("DispatchOrder", `"appointmentAt" DATETIME`);
  await ensureColumn("DispatchOrder", `"handledPhone" TEXT`);
  await ensureColumn("DispatchOrder", `"convertedToPreciseById" INTEGER`);
  await ensureColumn("DispatchOrder", `"convertedToPreciseAt" DATETIME`);
  await ensureColumn("DispatchOrder", `"isDeleted" BOOLEAN NOT NULL DEFAULT false`);
  await ensureColumn("DispatchOrder", `"tenantId" INTEGER`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchOrder_packageId_idx" ON "DispatchOrder"("packageId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchOrder_claimedById_idx" ON "DispatchOrder"("claimedById");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchOrder_convertedToPreciseById_idx" ON "DispatchOrder"("convertedToPreciseById");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchOrder_tenantId_idx" ON "DispatchOrder"("tenantId");`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DispatchOrderRecord" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "tenantId" INTEGER,
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
  await ensureColumn("DispatchOrderRecord", `"tenantId" INTEGER`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchOrderRecord_orderId_idx" ON "DispatchOrderRecord"("orderId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchOrderRecord_operatorId_idx" ON "DispatchOrderRecord"("operatorId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DispatchOrderRecord_tenantId_idx" ON "DispatchOrderRecord"("tenantId");`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Store" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "tenantId" INTEGER NOT NULL,
      "name" TEXT NOT NULL,
      "managerUserId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Store_tenantId_idx" ON "Store"("tenantId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Store_managerUserId_idx" ON "Store"("managerUserId");`);
}

async function ensureTenantBuiltinRoles(tenantId, menus) {
  const adminCode = `TENANT_${tenantId}_ADMIN`;
  const userCode = `TENANT_${tenantId}_USER`;

  const adminRole = await prisma.role.upsert({
    where: { code: adminCode },
    create: { code: adminCode, name: "管理员", tenantId, isBuiltin: true, dataScope: "TENANT" },
    update: { name: "管理员", tenantId, isBuiltin: true, dataScope: "TENANT" },
  });
  const userRole = await prisma.role.upsert({
    where: { code: userCode },
    create: { code: userCode, name: "普通用户", tenantId, isBuiltin: true, dataScope: "OWN" },
    update: { name: "普通用户", tenantId, isBuiltin: true, dataScope: "OWN" },
  });

  const adminKeys = ["dashboard", "dispatch-order", "user-manage", "package-manage", "store-manage", "role-menu", "system-config", "perm-order-dispatch-assign", "perm-order-delete-btn"];
  const userKeys = ["dashboard", "dispatch-order"];
  const adminMenus = menus.filter((m) => adminKeys.includes(m.key));
  const userMenus = menus.filter((m) => userKeys.includes(m.key));

  await prisma.roleMenu.deleteMany({ where: { roleId: adminRole.id } });
  if (adminMenus.length) {
    await prisma.roleMenu.createMany({ data: adminMenus.map((m) => ({ roleId: adminRole.id, menuId: m.id })) });
  }

  await prisma.roleMenu.deleteMany({ where: { roleId: userRole.id } });
  if (userMenus.length) {
    await prisma.roleMenu.createMany({ data: userMenus.map((m) => ({ roleId: userRole.id, menuId: m.id })) });
  }

  return { adminRole, userRole };
}

async function main() {
  await ensureSchema();

  const defaultTenant = await prisma.tenant.upsert({
    where: { code: "DEFAULT" },
    create: { code: "DEFAULT", name: "默认租户", isActive: true },
    update: { name: "默认租户", isActive: true },
  });

  await prisma.$executeRawUnsafe(`UPDATE "User" SET "tenantId" = ${defaultTenant.id} WHERE "tenantId" IS NULL AND "username" <> 'root';`);
  await prisma.$executeRawUnsafe(`UPDATE "Package" SET "tenantId" = ${defaultTenant.id} WHERE "tenantId" IS NULL;`);
  await prisma.$executeRawUnsafe(`UPDATE "DispatchOrder" SET "tenantId" = ${defaultTenant.id} WHERE "tenantId" IS NULL;`);
  await prisma.$executeRawUnsafe(`
    UPDATE "DispatchOrderRecord"
    SET "tenantId" = (
      SELECT "tenantId"
      FROM "DispatchOrder"
      WHERE "DispatchOrder"."id" = "DispatchOrderRecord"."orderId"
      LIMIT 1
    )
    WHERE "tenantId" IS NULL;
  `);

  const menus = [
    { key: "dashboard", name: "仪表盘", path: "/dashboard", icon: "home", sort: 1 },
    { key: "dispatch-order", name: "单据管理", path: "/dashboard/orders", icon: "send", sort: 2 },
    { key: "perm-order-dispatch-assign", name: "单据管理-派单按钮", path: "#", icon: "key", sort: 201 },
    { key: "perm-order-delete-btn", name: "单据管理-删除按钮", path: "#", icon: "key", sort: 202 },
    { key: "user-manage", name: "用户管理", path: "/dashboard/users", icon: "users", sort: 3 },
    { key: "package-manage", name: "套餐管理", path: "/dashboard/packages", icon: "box", sort: 4 },
    { key: "store-manage", name: "门店管理", path: "/dashboard/stores", icon: "shop", sort: 5 },
    { key: "role-menu", name: "角色管理", path: "/dashboard/role-menus", icon: "shield", sort: 6 },
    { key: "system-config", name: "参数配置", path: "/dashboard/settings", icon: "settings", sort: 7 },
    { key: "tenant-manage", name: "租户管理", path: "/dashboard/tenants", icon: "building", sort: 8 },
  ];

  for (const menu of menus) {
    await prisma.menu.upsert({ where: { key: menu.key }, create: menu, update: menu });
  }

  const dispatchOrderMenu = await prisma.menu.findUnique({ where: { key: "dispatch-order" }, select: { id: true } });
  if (dispatchOrderMenu) {
    await prisma.menu.updateMany({
      where: { key: { in: ["perm-order-dispatch-assign", "perm-order-delete-btn"] } },
      data: { parentId: dispatchOrderMenu.id },
    });
  }

  const allMenus = await prisma.menu.findMany({ orderBy: { sort: "asc" } });

  const superRole = await prisma.role.upsert({
    where: { code: "SUPER_ADMIN" },
    create: { code: "SUPER_ADMIN", name: "平台超管", tenantId: null, isBuiltin: true, dataScope: "TENANT" },
    update: { name: "平台超管", tenantId: null, isBuiltin: true, dataScope: "TENANT" },
  });

  await prisma.roleMenu.deleteMany({ where: { roleId: superRole.id } });
  const superMenus = allMenus.filter((m) => ["dashboard", "tenant-manage", "system-config"].includes(m.key));
  if (superMenus.length) {
    await prisma.roleMenu.createMany({ data: superMenus.map((m) => ({ roleId: superRole.id, menuId: m.id })) });
  }

  const superHash = await bcrypt.hash("root123", 10);
  await prisma.user.upsert({
    where: { username: "root" },
    create: {
      username: "root",
      passwordHash: superHash,
      displayName: "平台超管",
      accessMode: "BACKEND",
      roleId: superRole.id,
      tenantId: null,
    },
    update: {
      passwordHash: superHash,
      displayName: "平台超管",
      accessMode: "BACKEND",
      roleId: superRole.id,
      tenantId: null,
    },
  });

  const tenantRows = await prisma.tenant.findMany({ select: { id: true, code: true, name: true } });
  for (const tenant of tenantRows) {
    const { adminRole } = await ensureTenantBuiltinRoles(tenant.id, allMenus);

    if (tenant.code === "DEFAULT") {
      const adminPasswordHash = await bcrypt.hash("admin123", 10);
      await prisma.user.upsert({
        where: { username: "admin" },
        create: {
          username: "admin",
          passwordHash: adminPasswordHash,
          displayName: "系统管理员",
          accessMode: "BACKEND",
          roleId: adminRole.id,
          tenantId: tenant.id,
        },
        update: {
          passwordHash: adminPasswordHash,
          displayName: "系统管理员",
          accessMode: "BACKEND",
          roleId: adminRole.id,
          tenantId: tenant.id,
        },
      });
    }
  }

  const seedPackages = [
    { code: "BASIC_99", name: "基础套餐", price: 99, description: "适合小团队的基础派单能力", isActive: true, isDefault: true },
    { code: "PRO_299", name: "专业套餐", price: 299, description: "包含高级报表与权限细分能力", isActive: true, isDefault: false },
  ];

  for (const pkg of seedPackages) {
    const existed = await prisma.package.findUnique({ where: { code: pkg.code }, select: { id: true, tenantId: true } });
    if (!existed) {
      await prisma.package.create({ data: { ...pkg, tenantId: defaultTenant.id } });
    } else if (existed.tenantId === defaultTenant.id) {
      await prisma.package.update({ where: { id: existed.id }, data: { ...pkg, tenantId: defaultTenant.id } });
    }
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
