import { getServerSession, type NextAuthOptions } from "next-auth";
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

        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
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
      }
      return session;
    },
  },
};

export function getAuthSession() {
  return getServerSession(authOptions);
}
