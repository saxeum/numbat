import { describe, expect, it, vi } from "vitest";

import { verifyProviderKey } from "../src/gateway/providers";

function fetchStatus(status: number): typeof fetch {
  return vi.fn(
    async () => new Response("{}", { status }),
  ) as unknown as typeof fetch;
}

describe("verifyProviderKey", () => {
  it("accepts a 200", async () => {
    await expect(
      verifyProviderKey("groq", "k", fetchStatus(200)),
    ).resolves.toEqual({
      ok: true,
    });
  });

  it("reports a rejected key with the upstream status", async () => {
    await expect(
      verifyProviderKey("groq", "k", fetchStatus(401)),
    ).resolves.toEqual({
      ok: false,
      reason: "rejected",
      status: 401,
    });
  });

  it("verifies an NVIDIA key with Bearer auth", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(
      verifyProviderKey(
        "nvidia",
        "nvapi-abc",
        fetchMock as unknown as typeof fetch,
      ),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://integrate.api.nvidia.com/v1/models",
      { headers: { authorization: "Bearer nvapi-abc" } },
    );
  });

  it("reports a network failure as unreachable", async () => {
    const failing = vi.fn(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    await expect(verifyProviderKey("gemini", "k", failing)).resolves.toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});
