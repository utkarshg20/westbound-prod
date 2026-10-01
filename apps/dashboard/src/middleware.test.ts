import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { middleware } from "./middleware";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getUser } })),
}));

function request(path = "/api/review/approve", method = "POST", cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: cookie ? { cookie } : undefined,
  });
}

describe("review authentication middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REQUIRE_DAN_AUTH", undefined);
    vi.stubEnv("SUPABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
    getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["approve", "reject", "master-upload"])(
    "protects %s when REQUIRE_DAN_AUTH is unset",
    async (route) => {
      const response = await middleware(request(`/api/review/${route}`));
      expect(response.status).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
    }
  );

  it.each(["true", "", "TRUE", "0"])(
    "does not disable authentication for REQUIRE_DAN_AUTH=%j",
    async (setting) => {
      vi.stubEnv("REQUIRE_DAN_AUTH", setting);
      expect((await middleware(request())).status).toBe(401);
    }
  );

  it("retains the explicit local demo opt-out", async () => {
    vi.stubEnv("REQUIRE_DAN_AUTH", "false");
    expect((await middleware(request())).headers.get("x-middleware-next")).toBe("1");
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/review/approve", "GET"],
    ["/review", "GET"],
    ["/api/auth/magic-link", "POST"],
  ])("leaves %s %s outside this mutation gate", async (path, method) => {
    expect((await middleware(request(path, method))).headers.get("x-middleware-next")).toBe("1");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a forged cookie instead of treating its presence as authentication", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });
    const response = await middleware(request(undefined, undefined, "sb-access-token=forged"));
    expect(getUser).toHaveBeenCalledExactlyOnceWith("forged");
    expect(response.status).toBe(401);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it.each(["sb-access-token", "sb-auth-token"])(
    "verifies the token in the existing %s cookie with Supabase",
    async (cookieName) => {
      getUser.mockResolvedValue({ data: { user: { id: "authenticated-user" } }, error: null });
      const response = await middleware(request(undefined, undefined, `${cookieName}=access-token`));
      expect(createClient).toHaveBeenCalledExactlyOnceWith(
        "https://project.supabase.co",
        "public-anon-key",
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      );
      expect(getUser).toHaveBeenCalledExactlyOnceWith("access-token");
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it("uses the server database project's URL when it is configured", async () => {
    vi.stubEnv("SUPABASE_URL", "https://server-project.supabase.co");
    await middleware(request(undefined, undefined, "sb-access-token=access-token"));
    expect(createClient).toHaveBeenCalledWith(
      "https://server-project.supabase.co",
      "public-anon-key",
      expect.any(Object)
    );
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"])(
    "fails closed when %s is missing",
    async (envName) => {
      vi.stubEnv(envName, undefined);
      const response = await middleware(request(undefined, undefined, "sb-access-token=access-token"));
      expect(response.status).toBe(503);
      expect(createClient).not.toHaveBeenCalled();
    }
  );

  it("requires a verified user, not just an error-free response", async () => {
    const response = await middleware(request(undefined, undefined, "sb-access-token=access-token"));
    expect(response.status).toBe(401);
  });

  it("fails closed when authentication fails even if user data is present", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "authenticated-user" } },
      error: { message: "Authentication failed" },
    });
    expect((await middleware(request(undefined, undefined, "sb-access-token=access-token"))).status).toBe(401);
  });

  it("fails closed without exposing provider details when verification throws", async () => {
    getUser.mockRejectedValue(new Error("Sensitive provider detail"));
    const response = await middleware(request(undefined, undefined, "sb-access-token=access-token"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Review authentication is unavailable" });
  });
});
