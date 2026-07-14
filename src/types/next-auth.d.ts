import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      phone: string | null;
      plan: string;
      platformCredentials: string[];
      industryContext: string | null;
      intentScoreThreshold: number;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    plan: string;
    platformCredentials?: string[];
    industryContext?: string | null;
    intentScoreThreshold?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    name?: string | null;
    email?: string;
    phone?: string | null;
    plan?: string;
    platformCredentials?: string[];
    industryContext?: string | null;
    intentScoreThreshold?: number;
  }
}
