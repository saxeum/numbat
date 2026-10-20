import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const base = "https://foonix.net/api/todos";
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
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  expect(cookie).toContain("session_token");
  return cookie;
}

async function createTodo(cookie: string, title: string) {
  const res = await SELF.fetch(base, {
    method: "POST",
    headers: { ...json, cookie },
    body: JSON.stringify({ title }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as {
    id: string;
    title: string;
    completed: boolean;
  };
}

describe("todos (authenticated)", () => {
  it("rejects unauthenticated access with a 401 envelope", async () => {
    const res = await SELF.fetch(base);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("creates, lists, updates and deletes for the signed-in user", async () => {
    const cookie = await signUp("crud@example.com");

    await expect(
      (await SELF.fetch(base, { headers: { cookie } })).json(),
    ).resolves.toEqual([]);

    const created = await createTodo(cookie, "write tests");
    expect(created).toMatchObject({ title: "write tests", completed: false });

    const list = (await (
      await SELF.fetch(base, { headers: { cookie } })
    ).json()) as Array<{ id: string }>;
    expect(list.map((t) => t.id)).toContain(created.id);

    const patch = await SELF.fetch(`${base}/${created.id}`, {
      method: "PATCH",
      headers: { ...json, cookie },
      body: JSON.stringify({ completed: true }),
    });
    expect(patch.status).toBe(200);
    await expect(patch.json()).resolves.toMatchObject({ completed: true });

    const del = await SELF.fetch(`${base}/${created.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(204);
  });

  it("rejects invalid input with the error envelope", async () => {
    const cookie = await signUp("invalid@example.com");
    const res = await SELF.fetch(base, {
      method: "POST",
      headers: { ...json, cookie },
      body: JSON.stringify({ title: "" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("isolates todos between users", async () => {
    const alice = await signUp("alice@example.com");
    const bob = await signUp("bob@example.com");

    const aliceTodo = await createTodo(alice, "alice secret");

    // Bob cannot see it…
    const bobList = (await (
      await SELF.fetch(base, { headers: { cookie: bob } })
    ).json()) as Array<{ id: string }>;
    expect(bobList.map((t) => t.id)).not.toContain(aliceTodo.id);

    // …nor read/modify/delete it by id.
    const patch = await SELF.fetch(`${base}/${aliceTodo.id}`, {
      method: "PATCH",
      headers: { ...json, cookie: bob },
      body: JSON.stringify({ completed: true }),
    });
    expect(patch.status).toBe(404);

    const del = await SELF.fetch(`${base}/${aliceTodo.id}`, {
      method: "DELETE",
      headers: { cookie: bob },
    });
    expect(del.status).toBe(404);

    // Alice still sees it.
    const aliceList = (await (
      await SELF.fetch(base, { headers: { cookie: alice } })
    ).json()) as Array<{ id: string }>;
    expect(aliceList.map((t) => t.id)).toContain(aliceTodo.id);
  });
});
