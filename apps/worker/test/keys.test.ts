import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

const authBase = "https://foonix.net/api/auth";
const keysBase = "https://foonix.net/api/keys";
const modelsBase = "https://foonix.net/api/models";
const chatBase = "https://foonix.net/api/chat/completions";
const credentialsBase = "https://foonix.net/api/credentials";
const json = { "content-type": "application/json" };

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
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

interface CreatedKey {
  id: string;
  name: string;
  prefix: string;
  token: string;
}

async function createKey(cookie: string, name: string): Promise<CreatedKey> {
  const res = await SELF.fetch(keysBase, {
    method: "POST",
    headers: { ...json, cookie },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as CreatedKey;
}

function stubUpstream() {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes(":generateContent")) {
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: "pong" }] }, finishReason: "STOP" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/chat/completions")) {
      return new Response(
        JSON.stringify({
          id: "c",
          object: "chat.completion",
          model: "openai/gpt-oss-20b",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "pong" },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 }); // provider key verification
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api keys", () => {
  it("returns the token once and stores only a hash", async () => {
    const cookie = await signUp("keys1@example.com");
    const created = await createKey(cookie, "cli");

    expect(created.token.startsWith("nbk_")).toBe(true);
    expect(created.prefix).toBe(created.token.slice(0, 12));

    const list = (await (
      await SELF.fetch(keysBase, { headers: { cookie } })
    ).json()) as unknown[];
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(created.token);

    const row = await env.DB.prepare(
      "SELECT hash, prefix FROM api_keys",
    ).first<{
      hash: string;
      prefix: string;
    }>();
    expect(row?.hash).not.toBe(created.token);
    expect(row?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("authenticates the inference routes via Bearer", async () => {
    const cookie = await signUp("keys2@example.com");
    stubUpstream();

    const cred = await SELF.fetch(credentialsBase, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({ provider: "groq", apiKey: "gsk_test" }),
    });
    expect(cred.status).toBe(201);

    const key = await createKey(cookie, "cli");

    const models = await SELF.fetch(modelsBase, {
      headers: { authorization: `Bearer ${key.token}` },
    });
    expect(models.status).toBe(200);

    const chat = await SELF.fetch(chatBase, {
      method: "POST",
      headers: { ...json, authorization: `Bearer ${key.token}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(chat.status).toBe(200);
    const body = (await chat.json()) as {
      choices: { message: { content: string } }[];
    };
    expect(body.choices[0]?.message.content).toBe("pong");
  });

  it("rejects revoked and unknown keys", async () => {
    const cookie = await signUp("keys3@example.com");
    const key = await createKey(cookie, "cli");

    const revoked = await SELF.fetch(`${keysBase}/${key.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(revoked.status).toBe(204);

    expect(
      (
        await SELF.fetch(modelsBase, {
          headers: { authorization: `Bearer ${key.token}` },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await SELF.fetch(modelsBase, {
          headers: { authorization: "Bearer nbk_bogus" },
        })
      ).status,
    ).toBe(401);
  });

  it("keeps key management session-only and isolates users", async () => {
    const alice = await signUp("keys-alice@example.com");
    const bob = await signUp("keys-bob@example.com");
    const keyAlice = await createKey(alice, "alice-cli");

    // A bearer token cannot create keys (session-only).
    const withBearer = await SELF.fetch(keysBase, {
      method: "POST",
      headers: { ...json, authorization: `Bearer ${keyAlice.token}` },
      body: JSON.stringify({ name: "nope" }),
    });
    expect(withBearer.status).toBe(401);

    // Bob sees none of Alice's keys and cannot revoke them.
    await expect(
      (await SELF.fetch(keysBase, { headers: { cookie: bob } })).json(),
    ).resolves.toEqual([]);
    expect(
      (
        await SELF.fetch(`${keysBase}/${keyAlice.id}`, {
          method: "DELETE",
          headers: { cookie: bob },
        })
      ).status,
    ).toBe(404);
  });
});
