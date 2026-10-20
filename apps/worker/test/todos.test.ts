import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const base = "https://foonix.net/api/todos";
const json = { "content-type": "application/json" };

async function createTodo(title: string) {
  const res = await SELF.fetch(base, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ title }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as {
    id: string;
    title: string;
    completed: boolean;
  };
}

describe("todos CRUD", () => {
  it("starts empty", async () => {
    const res = await SELF.fetch(base);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it("creates, lists, updates and deletes", async () => {
    const created = await createTodo("write tests");
    expect(created).toMatchObject({ title: "write tests", completed: false });

    const list = (await (await SELF.fetch(base)).json()) as Array<{
      id: string;
    }>;
    expect(list.map((t) => t.id)).toContain(created.id);

    const patch = await SELF.fetch(`${base}/${created.id}`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ completed: true }),
    });
    expect(patch.status).toBe(200);
    await expect(patch.json()).resolves.toMatchObject({ completed: true });

    const del = await SELF.fetch(`${base}/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    await expect((await SELF.fetch(base)).json()).resolves.toEqual([]);
  });

  it("rejects invalid input with the error envelope", async () => {
    const res = await SELF.fetch(base, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ title: "" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("404s for an unknown id", async () => {
    const res = await SELF.fetch(`${base}/missing`, {
      method: "PATCH",
      headers: json,
      body: JSON.stringify({ completed: true }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "TODO_NOT_FOUND" },
    });
  });
});
