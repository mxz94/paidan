import { randomUUID } from "crypto";
import { getServerSession, type NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canAccessDashboard, canAccessMobile, normalizeAccessMode } from "@/lib/user-access";
import { ensureUserManageColumns } from "@/lib/db-ensure";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function buildLoggedOutToken(): JWT {
  return {
    id: "",
    roleCode: "",
    roleName: "",
    roleDataScope: "TENANT",
    username: "",
    accessMode: "SERVICE",
    loginTarget: "auto",
    tenantId: "",
    tenantCode: "",
    sessionToken: "",
  } as JWT;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        await ensureUserManageColumns();
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username: parsed.data.username },
          include: { role: true, tenant: true },
        });

        if (!user) {
          return null;
        }
        if (user.isDeleted || user.isDisabled) {
          return null;
        }

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        if (user.role.code !== "SUPER_ADMIN" && (!user.tenantId || !user.tenant?.isActive)) {
          return null;
        }
        const accessMode = normalizeAccessMode(user.accessMode);
        if (!canAccessDashboard(accessMode) && !canAccessMobile(accessMode)) {
          return null;
        }

        const nextSessionToken = randomUUID();
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            sessionToken: nextSessionToken,
          },
        });

        return {
          id: String(user.id),
          name: user.displayName,
          username: user.username,
          roleCode: user.role.code,
          roleName: user.role.name,
          roleDataScope: user.role.dataScope ?? "TENANT",
          accessMode,
          loginTarget: "auto",
          tenantId: user.tenantId ? String(user.tenantId) : "",
          tenantCode: user.tenant?.code ?? "",
          sessionToken: nextSessionToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roleCode = user.roleCode;
        token.roleName = user.roleName;
        token.roleDataScope = user.roleDataScope;
        token.username = user.username;
        token.accessMode = user.accessMode;
        token.loginTarget = user.loginTarget;
        token.tenantId = user.tenantId;
        token.tenantCode = user.tenantCode;
        token.sessionToken = user.sessionToken;
        return token;
      }

      const userId = Number(token.id);
      const sessionToken = String(token.sessionToken ?? "");
      if (!Number.isInteger(userId) || userId <= 0 || !sessionToken) {
        return buildLoggedOutToken();
      }

      await ensureUserManageColumns();
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isDeleted: true, isDisabled: true, sessionToken: true },
      });
      if (
        !currentUser ||
        currentUser.isDeleted ||
        currentUser.isDisabled ||
        !currentUser.sessionToken ||
        currentUser.sessionToken !== sessionToken
      ) {
        return buildLoggedOutToken();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.roleCode = String(token.roleCode ?? "");
        session.user.roleName = String(token.roleName ?? "");
        session.user.roleDataScope = String(token.roleDataScope ?? "TENANT");
        session.user.username = String(token.username ?? "");
        session.user.accessMode = String(token.accessMode ?? "SERVICE");
        session.user.loginTarget = String(token.loginTarget ?? "auto");
        session.user.tenantId = String(token.tenantId ?? "");
        session.user.tenantCode = String(token.tenantCode ?? "");
        session.user.sessionToken = String(token.sessionToken ?? "");
      }
      return session;
    },
  },
};

export function getAuthSession() {
  return getServerSession(authOptions);
}
