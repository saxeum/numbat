import { SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { trimHistory } from "../src/gateway/completions";

const convBase = "https://foonix.net/api/conversations";
const authBase = "https://foonix.net/api/auth";
const json = { "content-type": "application/json" };
const model = "openai/gpt-oss-120b";

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

function authed(cookie: string) {
  return { ...json, cookie };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubUpstream(handlers: { groq?: () => Response }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes("api.groq.com") && url.endsWith("/chat/completions")) {
      return handlers.groq?.() ?? jsonResponse({});
    }
    // Credential verification hits a models list.
    return jsonResponse({ data: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => vi.unstubAllGlobals());

async function connect(cookie: string) {
  const res = await SELF.fetch("https://foonix.net/api/credentials", {
    method: "POST",
    headers: authed(cookie),
    body: JSON.stringify({ provider: "groq", apiKey: "gsk_test" }),
  });
  expect(res.status).toBe(201);
}

async function createConversation(cookie: string): Promise<string> {
  const res = await SELF.fetch(convBase, {
    method: "POST",
    headers: authed(cookie),
    body: JSON.stringify({ title: "Test", model }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

interface Detail {
  messages: {
    id: string;
    role: string;
    content: string;
    provider: string | null;
    completionTokens: number | null;
    promptTokens: number | null;
  }[];
}

async function detail(cookie: string, id: string): Promise<Detail> {
  const res = await SELF.fetch(`${convBase}/${id}`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as Detail;
}

function completionResponse(content: string): Response {
  return jsonResponse({
    id: "chatcmpl-1",
    object: "chat.completion",
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
  });
}

describe("conversation completions (server-orchestrated)", () => {
  it("persists the user + assistant turn (non-streaming)", async () => {
    const cookie = await signUp("cc-nonstream@example.com");
    stubUpstream({ groq: () => completionResponse("Pong") });
    await connect(cookie);
    const id = await createConversation(cookie);

    const res = await SELF.fetch(`${convBase}/${id}/completions`, {
      method: "POST",
      headers: authed(cookie),
      body: JSON.stringify({ model, content: "ping", stream: false }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    expect(body.choices[0]?.message.content).toBe("Pong");

    const conversation = await detail(cookie, id);
    expect(conversation.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(conversation.messages[0]?.content).toBe("ping");
    expect(conversation.messages[1]?.content).toBe("Pong");
    expect(conversation.messages[1]?.completionTokens).toBe(7);
    expect(conversation.messages[1]?.provider).toBe("groq");
  });

  it("persists the assistant turn after a streamed reply", async () => {
    const cookie = await signUp("cc-stream@example.com");
    const sse = [
      `data: ${JSON.stringify({ model, choices: [{ index: 0, delta: { content: "Pong" } }] })}`,
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "!" } }] })}`,
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 2 } })}`,
      "data: [DONE]",
      "",
    ].join("\n\n");
    stubUpstream({
      groq: () =>
        new Response(sse, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    });
    await connect(cookie);
    const id = await createConversation(cookie);

    const res = await SELF.fetch(`${convBase}/${id}/completions`, {
      method: "POST",
      headers: authed(cookie),
      body: JSON.stringify({ model, content: "ping", stream: true }),
    });
    expect(res.status).toBe(200);
    // Consuming the stream runs the persistence flush.
    const text = await res.text();
    expect(text).toContain("Pong");

    const conversation = await detail(cookie, id);
    expect(conversation.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(conversation.messages[1]?.content).toBe("Pong!");
    expect(conversation.messages[1]?.completionTokens).toBe(2);
  });

  it("regenerates without appending a new user turn", async () => {
    const cookie = await signUp("cc-regen@example.com");
    stubUpstream({ groq: () => completionResponse("Pong") });
    await connect(cookie);
    const id = await createConversation(cookie);

    await SELF.fetch(`${convBase}/${id}/completions`, {
      method: "POST",
      headers: authed(cookie),
      body: JSON.stringify({ model, content: "ping", stream: false }),
    });
    const first = await detail(cookie, id);
    const assistant = first.messages.find((m) => m.role === "assistant")!;

    await SELF.fetch(`${convBase}/${id}/messages/${assistant.id}`, {
      method: "DELETE",
      headers: { cookie },
    });

    const res = await SELF.fetch(`${convBase}/${id}/completions`, {
      method: "POST",
      headers: authed(cookie),
      body: JSON.stringify({ model, regenerate: true, stream: false }),
    });
    expect(res.status).toBe(200);

    const second = await detail(cookie, id);
    expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("requires content unless regenerating", async () => {
    const cookie = await signUp("cc-invalid@example.com");
    stubUpstream({ groq: () => completionResponse("Pong") });
    await connect(cookie);
    const id = await createConversation(cookie);

    const res = await SELF.fetch(`${convBase}/${id}/completions`, {
      method: "POST",
      headers: authed(cookie),
      body: JSON.stringify({ model, stream: false }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("is owner-scoped", async () => {
    const alice = await signUp("cc-alice@example.com");
    const bob = await signUp("cc-bob@example.com");
    stubUpstream({ groq: () => completionResponse("Pong") });
    await connect(alice);
    const id = await createConversation(alice);

    const res = await SELF.fetch(`${convBase}/${id}/completions`, {
      method: "POST",
      headers: authed(bob),
      body: JSON.stringify({ model, content: "hi", stream: false }),
    });
    expect(res.status).toBe(404);
  });
});

describe("trimHistory", () => {
  const message = (content: string) => ({ role: "user" as const, content });

  it("keeps everything under the budget", () => {
    const result = trimHistory([message("a"), message("b")], 100);
    expect(result.messages.map((m) => m.content)).toEqual(["a", "b"]);
    expect(result.omitted).toBe(0);
  });

  it("drops the oldest messages over the budget", () => {
    const result = trimHistory(
      [message("aaaa"), message("bbbb"), message("cccc")],
      8,
    );
    expect(result.messages.map((m) => m.content)).toEqual(["bbbb", "cccc"]);
    expect(result.omitted).toBe(1);
  });

  it("always keeps at least the final message", () => {
    const result = trimHistory([message("x".repeat(50))], 1);
    expect(result.messages).toHaveLength(1);
    expect(result.omitted).toBe(0);
  });
});
