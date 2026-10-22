import { expect, test, type Page } from "@playwright/test";

const credentials = [
  {
    id: "cred-1",
    provider: "groq",
    label: "default",
    fingerprint: "abc",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

const models = {
  object: "list",
  data: [
    {
      id: "openai/gpt-oss-120b",
      object: "model",
      owned_by: "groq",
      "x-provider": "groq",
      "x-free": true,
    },
  ],
};

const DEFAULT_REPLY = "Pong — ready when you are.\n\n```js\nconst x = 1;\n```";

interface MockMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  model: string | null;
  provider: string | null;
  completionTokens: number | null;
  ttftMs: number | null;
  totalMs: number | null;
  reasoning?: string | null;
  reasoningMs?: number | null;
  stopped: boolean;
  createdAt: string;
}

interface MockConversation {
  id: string;
  title: string;
  model: string;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
  messages: MockMessage[];
}

/**
 * Stateful in-memory mock of the conversations API. The KAN-42 client delegates
 * persistence to the server, so the mock stores turns itself (no double-write).
 */
async function mockGateway(
  page: Page,
  reply: string = DEFAULT_REPLY,
  thinking?: { reasoning: string; reasoningMs?: number },
  delayMs = 0,
) {
  let seq = 0;
  const uid = () => `id-${++seq}`;
  const store = new Map<string, MockConversation>();
  const sse = [
    ...(thinking
      ? [
          `data: ${JSON.stringify({ model: "openai/gpt-oss-120b", choices: [{ index: 0, delta: { reasoning_content: thinking.reasoning } }] })}`,
        ]
      : []),
    `data: ${JSON.stringify({ model: "openai/gpt-oss-120b", choices: [{ index: 0, delta: { content: reply } }] })}`,
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {} }], usage: { prompt_tokens: 12, completion_tokens: 7 } })}`,
    "data: [DONE]",
    "",
  ].join("\n\n");

  const meta = (c: MockConversation) => ({
    id: c.id,
    title: c.title,
    model: c.model,
    provider: c.provider,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });

  await page.route("**/api/credentials", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(credentials),
    }),
  );
  await page.route("**/api/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(models),
    }),
  );

  await page.route("**/api/conversations**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    const parts = path.split("/").filter(Boolean); // api, conversations, id?, ...
    const id = parts[2];
    const sub = parts[3];
    const messageId = parts[4];
    const now = () => new Date().toISOString();

    if (!id) {
      if (method === "GET") {
        const list = [...store.values()]
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .map(meta);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(list),
        });
      }
      if (method === "POST") {
        const body = (request.postDataJSON() ?? {}) as {
          title?: string;
          model?: string;
        };
        const conversation: MockConversation = {
          id: uid(),
          title: body.title ?? "",
          model: body.model ?? "",
          provider: "groq",
          createdAt: now(),
          updatedAt: now(),
          messages: [],
        };
        store.set(conversation.id, conversation);
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(meta(conversation)),
        });
      }
    }

    const conversation = id ? store.get(id) : undefined;
    if (!conversation) {
      return route.fulfill({ status: 404, body: "{}" });
    }

    if (!sub) {
      if (method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...meta(conversation),
            messages: conversation.messages,
          }),
        });
      }
      if (method === "PATCH") {
        const body = (request.postDataJSON() ?? {}) as { title?: string };
        conversation.title = body.title ?? conversation.title;
        conversation.updatedAt = now();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(meta(conversation)),
        });
      }
      if (method === "DELETE") {
        store.delete(id!);
        return route.fulfill({ status: 204, body: "" });
      }
    }

    if (sub === "messages" && method === "DELETE") {
      const index = conversation.messages.findIndex((m) => m.id === messageId);
      if (index >= 0)
        conversation.messages = conversation.messages.slice(0, index);
      return route.fulfill({ status: 204, body: "" });
    }

    if (sub === "completions" && method === "POST") {
      const body = (request.postDataJSON() ?? {}) as {
        content?: string;
        regenerate?: boolean;
        model: string;
      };
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (!body.regenerate) {
        conversation.messages.push({
          id: uid(),
          conversationId: conversation.id,
          role: "user",
          content: body.content ?? "",
          model: body.model,
          provider: "groq",
          completionTokens: null,
          ttftMs: null,
          totalMs: null,
          stopped: false,
          createdAt: now(),
        });
      }
      conversation.messages.push({
        id: uid(),
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
        model: body.model,
        provider: "groq",
        completionTokens: 7,
        ttftMs: 30,
        totalMs: 120,
        ...(thinking
          ? {
              reasoning: thinking.reasoning,
              reasoningMs: thinking.reasoningMs ?? 4000,
            }
          : {}),
        stopped: false,
        createdAt: now(),
      });
      conversation.updatedAt = now();
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-byokfree-provider": "groq",
        },
        body: sse,
      });
    }

    return route.fulfill({ status: 404, body: "{}" });
  });
}

async function signIn(page: Page) {
  const email = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.fill("#email", email);
  await page.fill("#password", "password1234");
  await page.getByRole("button", { name: "Create account" }).click();
}

test("chat: empty state renders for a signed-in user with a provider", async ({
  page,
}) => {
  await mockGateway(page);
  await page.goto("/gateway/chat");
  await signIn(page);

  await expect(page.getByPlaceholder("Message Foonix…")).toBeVisible({
    timeout: 15_000,
  });
});

test("chat: send a message, stream a reply, and persist the conversation", async ({
  page,
}) => {
  await mockGateway(page);
  await page.goto("/gateway/chat");
  await signIn(page);

  const composer = page.getByPlaceholder("Message Foonix…");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("Say pong");
  await composer.press("Enter");

  await expect(page.getByText("ready when you are.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/groq · openai\/gpt-oss-120b/)).toBeVisible();
  await expect(page.getByText(/TTFT \d+ ms · TPS \d/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Say pong" })).toBeVisible();

  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByText("ready when you are.")).toBeVisible({
    timeout: 15_000,
  });
});

test("chat: shows and persists the thinking block", async ({ page }) => {
  await mockGateway(page, DEFAULT_REPLY, {
    reasoning: "Let me think about this carefully.",
    reasoningMs: 4200,
  });
  await page.goto("/gateway/chat");
  await signIn(page);

  const composer = page.getByPlaceholder("Message Foonix…");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("Think then pong");
  await composer.press("Enter");

  // Once the answer arrives the block collapses to a "Thought for Ns" row.
  await expect(page.getByText("ready when you are.")).toBeVisible({
    timeout: 15_000,
  });
  const summary = page.getByRole("button", { name: /Thought for \d+s/ });
  await expect(summary).toBeVisible();

  // Expanding reveals the reasoning text.
  await summary.click();
  await expect(
    page.getByText("Let me think about this carefully."),
  ).toBeVisible();

  // The reasoning survives a reload (persisted server-side).
  await page.waitForTimeout(600);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Thought for \d+s/ }),
  ).toBeVisible({ timeout: 15_000 });
});

test("chat: shows the sent turn immediately, before the reply streams", async ({
  page,
}) => {
  await mockGateway(page, DEFAULT_REPLY, undefined, 1500);
  await page.goto("/gateway/chat");
  await signIn(page);

  const composer = page.getByPlaceholder("Message Foonix…");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("Hello there");
  await composer.press("Enter");

  // The just-sent turn renders immediately instead of the thread going empty
  // while the server persists the turn and the reply streams.
  await expect(
    page.getByTestId("message-scroll").getByText("Hello there"),
  ).toBeVisible({ timeout: 2000 });

  // The assistant blob animates while waiting for the first token.
  await expect(page.locator(".mark-waiting")).toBeVisible({ timeout: 2000 });

  await expect(page.getByText("ready when you are.")).toBeVisible({
    timeout: 15_000,
  });
});

test("chat: renders markdown, regenerates, and renames", async ({ page }) => {
  await mockGateway(page);
  await page.goto("/gateway/chat");
  await signIn(page);

  const composer = page.getByPlaceholder("Message Foonix…");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("Show me code");
  await composer.press("Enter");

  await expect(page.locator(".markdown pre")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.locator(".markdown pre")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Show me code" }).dblclick();
  const titleInput = page.locator("aside input");
  await titleInput.fill("Renamed chat");
  await titleInput.press("Enter");
  await expect(page.getByRole("link", { name: "Renamed chat" })).toBeVisible();
});

test("chat: mobile drawer opens the conversation list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockGateway(page);
  await page.goto("/gateway/chat");
  await signIn(page);

  const composer = page.getByPlaceholder("Message Foonix…");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("Mobile hello");
  await composer.press("Enter");
  await expect(page.getByText("ready when you are.")).toBeVisible({
    timeout: 15_000,
  });

  await expect(page.getByRole("link", { name: "Mobile hello" })).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "Mobile hello" }),
  ).toBeVisible();

  await drawer.getByRole("link", { name: "Mobile hello" }).click();
  await expect(drawer).toBeHidden();
});

test("chat: jump-to-latest appears when scrolled up", async ({ page }) => {
  const longReply = Array.from(
    { length: 120 },
    (_, index) => `Line ${index + 1} of a deliberately long reply.`,
  ).join("\n\n");

  await mockGateway(page, longReply);
  await page.goto("/gateway/chat");
  await signIn(page);

  const composer = page.getByPlaceholder("Message Foonix…");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("Give me a long reply");
  await composer.press("Enter");
  await expect(
    page.getByText(/Line 120 of a deliberately long reply/),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("message-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  const jump = page.getByRole("button", { name: /jump to latest/i });
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(jump).toBeHidden();
});

test("chat: recent chats stay in the sidebar on other routes", async ({
  page,
}) => {
  await mockGateway(page);
  await page.goto("/gateway/chat");
  await signIn(page);

  const composer = page.getByPlaceholder("Message Foonix…");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await composer.fill("Persistent chat");
  await composer.press("Enter");
  await expect(page.getByRole("link", { name: "Persistent chat" })).toBeVisible(
    { timeout: 15_000 },
  );

  // Navigate home via the brand — the chat list should remain visible.
  await page.getByRole("link", { name: "Foonix" }).first().click();
  await expect(page.getByRole("link", { name: "Persistent chat" })).toBeVisible(
    { timeout: 15_000 },
  );
});
