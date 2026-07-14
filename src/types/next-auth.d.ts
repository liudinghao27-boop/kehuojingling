import "next-auth";
import type { NoiseRules } from "@/lib/ai/noise";

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
      noiseRules?: NoiseRules;
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
    noiseRules?: NoiseRules;
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
    noiseRules?: NoiseRules;
  }
}
