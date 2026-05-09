import { z } from "zod";

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
