import "next-auth";
import "next-auth/jwt";
import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface User extends DefaultUser {
    roleCode: string;
    roleName: string;
    username: string;
    accessMode: string;
    tenantId: string;
    tenantCode: string;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      roleCode: string;
      roleName: string;
      username: string;
      accessMode: string;
      tenantId: string;
      tenantCode: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roleCode: string;
    roleName: string;
    username: string;
    accessMode: string;
    tenantId: string;
    tenantCode: string;
  }
}
