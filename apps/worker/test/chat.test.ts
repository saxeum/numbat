import { SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

const chatBase = "https://foonix.net/api/chat/completions";
const credentialsBase = "https://foonix.net/api/credentials";
const authBase = "https://foonix.net/api/auth";
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

async function connect(
  cookie: string,
  provider: "gemini" | "groq" | "nvidia",
  apiKey: string,
) {
  const res = await SELF.fetch(credentialsBase, {
    method: "POST",
    headers: { ...json, cookie },
    body: JSON.stringify({ provider, apiKey }),
  });
  expect(res.status).toBe(201);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stub outbound fetch (shared isolate). Routes provider verification + chat. */
function stubUpstream(handlers: {
  verify?: () => Response;
  groq?: () => Response;
  gemini?: () => Response;
  nvidia?: () => Response;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes(":generateContent")) {
      return handlers.gemini?.() ?? jsonResponse({ candidates: [] });
    }
    if (url.includes("api.groq.com") && url.endsWith("/chat/completions")) {
      return handlers.groq?.() ?? jsonResponse({});
    }
    if (
      url.includes("integrate.api.nvidia.com") &&
      url.endsWith("/chat/completions")
    ) {
      return handlers.nvidia?.() ?? jsonResponse({});
    }
    // Provider verification (all providers) hits a models list.
    return handlers.verify?.() ?? jsonResponse({ data: [], models: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("chat completions (authenticated)", () => {
  it("rejects unauthenticated access", async () => {
    const res = await SELF.fetch(chatBase, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ model: "openai/gpt-oss-20b", messages: [] }),
    });
    expect(res.status).toBe(401);
  });

  it("proxies Groq (OpenAI dialect) using the stored key", async () => {
    const cookie = await signUp("chat-groq@example.com");
    stubUpstream({
      groq: () =>
        jsonResponse({
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 1,
          model: "openai/gpt-oss-20b",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "pong" },
              finish_reason: "stop",
            },
          ],
        }),
    });
    await connect(cookie, "groq", "gsk_test");

    const res = await SELF.fetch(chatBase, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-byokfree-provider")).toBe("groq");
    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    expect(body.choices[0]?.message.content).toBe("pong");
  });

  it("proxies NVIDIA (OpenAI dialect) using the stored key", async () => {
    const cookie = await signUp("chat-nvidia@example.com");
    stubUpstream({
      nvidia: () =>
        jsonResponse({
          id: "chatcmpl-nv",
          object: "chat.completion",
          created: 1,
          model: "nvidia/nemotron-3-ultra-550b-a55b",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "pong" },
              finish_reason: "stop",
            },
          ],
        }),
    });
    await connect(cookie, "nvidia", "nvapi_test");

    const res = await SELF.fetch(chatBase, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        model: "nvidia/nemotron-3-ultra-550b-a55b",
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-byokfree-provider")).toBe("nvidia");
    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    expect(body.choices[0]?.message.content).toBe("pong");
  });

  it("requests a usage chunk from OpenAI-compatible providers when streaming", async () => {
    const cookie = await signUp("chat-usage@example.com");
    let sent: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.endsWith("/chat/completions")) {
          sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return new Response(
            'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n',
            { status: 200, headers: { "content-type": "text/event-stream" } },
          );
        }
        return jsonResponse({ data: [] }); // provider key verification
      }),
    );
    await connect(cookie, "groq", "gsk_test");

    const res = await SELF.fetch(chatBase, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(sent?.stream).toBe(true);
    expect(sent?.stream_options).toEqual({ include_usage: true });
  });

  it("translates Gemini responses into the OpenAI shape", async () => {
    const cookie = await signUp("chat-gemini@example.com");
    stubUpstream({
      gemini: () =>
        jsonResponse({
          candidates: [
            { content: { parts: [{ text: "pong" }] }, finishReason: "STOP" },
          ],
          usageMetadata: {
            promptTokenCount: 3,
            candidatesTokenCount: 1,
            totalTokenCount: 4,
          },
        }),
    });
    await connect(cookie, "gemini", "AIza_test");

    const res = await SELF.fetch(chatBase, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        model: "gemini-flash-lite-latest",
        messages: [{ role: "user", content: "ping" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-byokfree-provider")).toBe("gemini");
    const body = (await res.json()) as {
      object: string;
      model: string;
      choices: { message: { content: string }; finish_reason: string }[];
    };
    expect(body.object).toBe("chat.completion");
    expect(body.model).toBe("gemini-flash-lite-latest");
    expect(body.choices[0]?.message.content).toBe("pong");
    expect(body.choices[0]?.finish_reason).toBe("stop");
  });

  it("400s when no credential is connected", async () => {
    const cookie = await signUp("chat-nocred@example.com");
    stubUpstream({});

    const res = await SELF.fetch(chatBase, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "NO_CREDENTIAL" },
    });
  });

  it("404s an unknown model", async () => {
    const cookie = await signUp("chat-unknown@example.com");
    stubUpstream({});
    const res = await SELF.fetch(chatBase, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        model: "ghost-model",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "MODEL_NOT_FOUND" },
    });
  });

  it("501s an unsupported provider hint", async () => {
    const cookie = await signUp("chat-unsupported@example.com");
    const res = await SELF.fetch(chatBase, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({
        model: "whatever",
        provider: "openai",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(res.status).toBe(501);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "UNSUPPORTED_PROVIDER" },
    });
  });
});
