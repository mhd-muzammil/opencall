import { describe, expect, it } from "vitest";
import { ApiClientError, isApiAuthError, readJson } from "./http";

function jsonResponse(body: unknown, init: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

describe("readJson", () => {
  it("returns wrapped data for successful API responses", async () => {
    await expect(
      readJson<{ ok: true }>(jsonResponse({ data: { ok: true } }, { status: 200 })),
    ).resolves.toEqual({ ok: true });
  });

  it("keeps backend 422 data passthrough for validation previews", async () => {
    await expect(
      readJson<{ accepted: boolean }>(
        jsonResponse({ data: { accepted: false } }, { status: 422 }),
      ),
    ).resolves.toEqual({ accepted: false });
  });

  it("throws a typed auth error when the backend reports an expired bearer token", async () => {
    const response = jsonResponse(
      {
        error: {
          code: "HttpError",
          message: "Bearer token has expired",
          details: null,
        },
      },
      { status: 401 },
    );

    await expect(readJson<unknown>(response)).rejects.toMatchObject({
      name: "ApiClientError",
      message: "Bearer token has expired",
      status: 401,
      code: "HttpError",
      details: null,
    });
  });

  it("classifies only typed 401 API errors as auth errors", () => {
    expect(
      isApiAuthError(
        new ApiClientError("Bearer token has expired", 401, {
          error: { message: "Bearer token has expired" },
        }),
      ),
    ).toBe(true);
    expect(
      isApiAuthError(
        new ApiClientError("Forbidden", 403, {
          error: { message: "Forbidden" },
        }),
      ),
    ).toBe(false);
    expect(isApiAuthError(new Error("Bearer token has expired"))).toBe(false);
  });

  it("falls back to the response status when an error body is not JSON", async () => {
    const response = new Response("not-json", { status: 500 });

    await expect(readJson<unknown>(response)).rejects.toMatchObject({
      message: "Request failed 500",
      status: 500,
      code: null,
      details: null,
    });
  });
});
