import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const base = "https://foonix.net/api/conversations";
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

function authed(cookie: string) {
  return { ...json, cookie };
}

async function createConversation(
  cookie: string,
  title: string,
): Promise<{ id: string; title: string }> {
  const res = await SELF.fetch(base, {
    method: "POST",
    headers: authed(cookie),
    body: JSON.stringify({ title, model: "openai/gpt-oss-20b" }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; title: string };
}

describe("conversations (authenticated)", () => {
  it("rejects unauthenticated access", async () => {
    const res = await SELF.fetch(base);
    expect(res.status).toBe(401);
  });

  it("creates, lists, appends, renames, and deletes", async () => {
    const cookie = await signUp("conv-crud@example.com");
    const conversation = await createConversation(cookie, "Hello");

    // List includes it.
    const list = await SELF.fetch(base, { headers: { cookie } });
    expect(list.status).toBe(200);
    const rows = (await list.json()) as { id: string }[];
    expect(rows.map((row) => row.id)).toContain(conversation.id);

    // Append a user + an assistant message (with metrics).
    const userMessage = await SELF.fetch(
      `${base}/${conversation.id}/messages`,
      {
        method: "POST",
        headers: authed(cookie),
        body: JSON.stringify({ role: "user", content: "Say pong" }),
      },
    );
    expect(userMessage.status).toBe(201);

    const assistantMessage = await SELF.fetch(
      `${base}/${conversation.id}/messages`,
      {
        method: "POST",
        headers: authed(cookie),
        body: JSON.stringify({
          role: "assistant",
          content: "Pong",
          model: "openai/gpt-oss-20b",
          provider: "groq",
          promptTokens: 12,
          completionTokens: 7,
          reasoningTokens: 3,
          ttftMs: 30,
          totalMs: 120,
        }),
      },
    );
    expect(assistantMessage.status).toBe(201);

    // Detail returns messages in order with persisted metadata.
    const detail = await SELF.fetch(`${base}/${conversation.id}`, {
      headers: { cookie },
    });
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      messages: { role: string; content: string; completionTokens: number }[];
    };
    expect(body.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(body.messages[1]?.content).toBe("Pong");
    expect(body.messages[1]?.completionTokens).toBe(7);

    // Rename.
    const renamed = await SELF.fetch(`${base}/${conversation.id}`, {
      method: "PATCH",
      headers: authed(cookie),
      body: JSON.stringify({ title: "Renamed" }),
    });
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { title: string }).title).toBe("Renamed");

    // Delete → 204, then 404.
    const deleted = await SELF.fetch(`${base}/${conversation.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(deleted.status).toBe(204);
    const gone = await SELF.fetch(`${base}/${conversation.id}`, {
      headers: { cookie },
    });
    expect(gone.status).toBe(404);
  });

  it("rejects an invalid message role", async () => {
    const cookie = await signUp("conv-invalid@example.com");
    const conversation = await createConversation(cookie, "Validate");
    const res = await SELF.fetch(`${base}/${conversation.id}/messages`, {
      method: "POST",
      headers: authed(cookie),
      body: JSON.stringify({ role: "bogus", content: "hi" }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("truncates a message and everything after it", async () => {
    const cookie = await signUp("conv-truncate@example.com");
    const conversation = await createConversation(cookie, "Truncate");

    for (const [role, content] of [
      ["user", "one"],
      ["assistant", "two"],
      ["user", "three"],
    ] as const) {
      const res = await SELF.fetch(`${base}/${conversation.id}/messages`, {
        method: "POST",
        headers: authed(cookie),
        body: JSON.stringify({ role, content }),
      });
      expect(res.status).toBe(201);
    }

    const detail = await SELF.fetch(`${base}/${conversation.id}`, {
      headers: { cookie },
    });
    const body = (await detail.json()) as {
      messages: { id: string; content: string }[];
    };
    expect(body.messages.map((message) => message.content)).toEqual([
      "one",
      "two",
      "three",
    ]);

    // Delete the second message and everything after it.
    const target = body.messages[1]!;
    const deleted = await SELF.fetch(
      `${base}/${conversation.id}/messages/${target.id}`,
      { method: "DELETE", headers: { cookie } },
    );
    expect(deleted.status).toBe(204);

    const after = await SELF.fetch(`${base}/${conversation.id}`, {
      headers: { cookie },
    });
    const afterBody = (await after.json()) as {
      messages: { content: string }[];
    };
    expect(afterBody.messages.map((message) => message.content)).toEqual([
      "one",
    ]);
  });

  it("is owner-scoped", async () => {
    const alice = await signUp("conv-alice@example.com");
    const bob = await signUp("conv-bob@example.com");
    const conversation = await createConversation(alice, "Alice's chat");

    const bobGet = await SELF.fetch(`${base}/${conversation.id}`, {
      headers: { cookie: bob },
    });
    expect(bobGet.status).toBe(404);

    const bobAppend = await SELF.fetch(`${base}/${conversation.id}/messages`, {
      method: "POST",
      headers: authed(bob),
      body: JSON.stringify({ role: "user", content: "hi" }),
    });
    expect(bobAppend.status).toBe(404);

    const bobDelete = await SELF.fetch(`${base}/${conversation.id}`, {
      method: "DELETE",
      headers: { cookie: bob },
    });
    expect(bobDelete.status).toBe(404);

    // Bob's list is empty.
    const bobList = await SELF.fetch(base, { headers: { cookie: bob } });
    expect((await bobList.json()) as unknown[]).toHaveLength(0);
  });
});
