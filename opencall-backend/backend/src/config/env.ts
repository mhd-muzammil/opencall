import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const apiRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

dotenv.config({ path: path.join(apiRoot, ".env") });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  UPLOAD_DIR: z.string().min(1).default("./storage/uploads"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  ADMIN_COOKIE_SECRET: z.string().min(1).default("dev-admin-cookie-secret-change-me"),
  ADMIN_SESSION_SECRET: z.string().min(1).default("dev-admin-session-secret-change-me"),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const productionSecrets = [
    ["JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET],
    ["ADMIN_COOKIE_SECRET", env.ADMIN_COOKIE_SECRET],
    ["ADMIN_SESSION_SECRET", env.ADMIN_SESSION_SECRET],
  ] as const;

  for (const [name, value] of productionSecrets) {
    if (
      value.length < 32 ||
      value.includes("change-me") ||
      value.includes("change-this") ||
      value.includes("replace-with")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [name],
        message: `${name} must be a strong production secret with at least 32 characters`,
      });
    }
  }

  if (env.CORS_ORIGIN === "*") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CORS_ORIGIN"],
      message: "CORS_ORIGIN must be restricted in production",
    });
  }
});

export const env = envSchema.parse(process.env);
