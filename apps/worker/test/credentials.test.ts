import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

const base = "https://foonix.net/api/credentials";
const authBase = "https://foonix.net/api/auth";
const json = { "content-type": "application/json" };

/** Sign up (dev email/password) and return the session cookie. */
async function signUp(email: string): Promise<string> {
  const res = await SELF.fetch(`${authBase}/sign-up/email`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({
      email,
      password: "password1234",
      name: "Test User",
    }),
  });
  expect(res.status).toBe(200);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  expect(cookie).toContain("session_token");
  return cookie;
}

/** Stub the outbound provider verification call (shares the test isolate). */
function stubProvider(ok: boolean) {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("{}", { status: ok ? 200 : 401 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("credentials (authenticated)", () => {
  it("rejects unauthenticated access", async () => {
    const res = await SELF.fetch(base);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("verifies, stores encrypted, lists masked, then deletes", async () => {
    const cookie = await signUp("cred@example.com");
    const fetchMock = stubProvider(true);

    const create = await SELF.fetch(base, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        provider: "groq",
        apiKey: "gsk_live_secret_value",
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string };
    expect(fetchMock).toHaveBeenCalledOnce();

    // The response never contains the key.
    expect(JSON.stringify(created)).not.toContain("gsk_live_secret_value");

    // The database holds ciphertext only.
    const row = await env.DB.prepare(
      "SELECT ciphertext, wrapped_dek FROM provider_credentials",
    ).first<{ ciphertext: string; wrapped_dek: string }>();
    expect(row?.ciphertext).toBeTruthy();
    expect(row?.wrapped_dek).toBeTruthy();
    expect(row?.ciphertext).not.toContain("gsk_live_secret_value");

    // Listing returns masked metadata (no secret / ciphertext fields).
    const list = (await (
      await SELF.fetch(base, { headers: { cookie } })
    ).json()) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ provider: "groq", label: "" });
    expect(Object.keys(list[0]!)).not.toContain("ciphertext");
    expect(JSON.stringify(list)).not.toContain("gsk_live_secret_value");

    // Delete (crypto-shred).
    const del = await SELF.fetch(`${base}/${created.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(204);
    await expect(
      (await SELF.fetch(base, { headers: { cookie } })).json(),
    ).resolves.toEqual([]);
  });

  it("rejects an unverifiable key with 400", async () => {
    const cookie = await signUp("bad-key@example.com");
    stubProvider(false);

    const res = await SELF.fetch(base, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({ provider: "gemini", apiKey: "not-a-real-key" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "INVALID_CREDENTIAL" },
    });
  });

  it("tolerates a pasted `.env` line (strips the NAME= prefix)", async () => {
    const cookie = await signUp("envline@example.com");
    const fetchMock = stubProvider(true);

    const res = await SELF.fetch(base, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        provider: "groq",
        apiKey: "GROQ_API_KEY=gsk_live_value",
      }),
    });

    expect(res.status).toBe(201);
    // The upstream call used the bare value, not the whole line.
    const [, init] = fetchMock.mock.calls[0]!;
    const auth = (init?.headers as Record<string, string>).authorization;
    expect(auth).toBe("Bearer gsk_live_value");
  });

  it("validates the request body", async () => {
    const cookie = await signUp("invalid-cred@example.com");
    const res = await SELF.fetch(base, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({ provider: "groq" }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("isolates credentials between users", async () => {
    const alice = await signUp("alice-cred@example.com");
    const bob = await signUp("bob-cred@example.com");
    stubProvider(true);

    const created = (await (
      await SELF.fetch(base, {
        method: "POST",
        headers: { ...json, cookie: alice },
        body: JSON.stringify({ provider: "groq", apiKey: "alice-key" }),
      })
    ).json()) as { id: string };

    await expect(
      (await SELF.fetch(base, { headers: { cookie: bob } })).json(),
    ).resolves.toEqual([]);

    const del = await SELF.fetch(`${base}/${created.id}`, {
      method: "DELETE",
      headers: { cookie: bob },
    });
    expect(del.status).toBe(404);
  });
});
