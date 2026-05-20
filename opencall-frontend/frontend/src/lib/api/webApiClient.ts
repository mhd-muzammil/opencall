import { createOpenCallApiClient } from "./openCallApiClient";

export const WEB_API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

export const webApiClient = createOpenCallApiClient({
  baseUrl: WEB_API_BASE_URL,
});
