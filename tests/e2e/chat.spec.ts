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

const sse = [
  'data: {"model":"openai/gpt-oss-120b","choices":[{"index":0,"delta":{"content":"Pong"}}]}',
  'data: {"choices":[{"index":0,"delta":{"content":" — "}}]}',
  'data: {"choices":[{"index":0,"delta":{"content":"ready when you are."}}]}',
  'data: {"choices":[{"index":0,"delta":{"content":"\\n\\n```js\\nconst x = 1;\\n```"}}]}',
  'data: {"choices":[{"index":0,"delta":{}}],"usage":{"prompt_tokens":12,"completion_tokens":7}}',
  "data: [DONE]",
  "",
].join("\n\n");

/** Mock the provider surface so the chat flow needs no real keys. */
async function mockGateway(page: Page, chatBody: string = sse) {
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
  await page.route("**/api/chat/completions", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-byokfree-provider": "groq",
      },
      body: chatBody,
    }),
  );
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

  await expect(
    page.getByRole("heading", { name: /how can i help you today/i }),
  ).toBeVisible({ timeout: 15_000 });
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

  // Streamed assistant reply + provider/model metrics.
  await expect(page.getByText("ready when you are.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/groq · openai\/gpt-oss-120b/)).toBeVisible();

  // Auto-titled conversation appears in the sidebar.
  await expect(page.getByRole("link", { name: "Say pong" })).toBeVisible();

  // Persists across a reload (server-side, D1 — KAN-39).
  await page.waitForTimeout(1200);
  await page.reload();
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

  // Markdown code block renders (lazy-loaded renderer).
  await expect(page.locator(".markdown pre")).toBeVisible({ timeout: 15_000 });

  // Regenerate re-runs the completion.
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.locator(".markdown pre")).toBeVisible({ timeout: 15_000 });

  // Rename via the sidebar (double-click the title).
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

  // Rail is hidden on mobile; the drawer holds it.
  await expect(page.getByRole("link", { name: "Mobile hello" })).toBeHidden();
  await page.getByRole("button", { name: "Open conversations" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("link", { name: "Mobile hello" }),
  ).toBeVisible();

  // Selecting a conversation closes the drawer.
  await drawer.getByRole("link", { name: "Mobile hello" }).click();
  await expect(drawer).toBeHidden();
});

test("chat: jump-to-latest appears when scrolled up", async ({ page }) => {
  const longReply = Array.from(
    { length: 120 },
    (_, index) => `Line ${index + 1} of a deliberately long reply.`,
  ).join("\n\n");
  const longSse = [
    `data: ${JSON.stringify({ model: "openai/gpt-oss-120b", choices: [{ index: 0, delta: { content: longReply } }] })}`,
    "data: [DONE]",
    "",
  ].join("\n\n");

  await mockGateway(page, longSse);
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
