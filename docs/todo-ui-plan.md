# numbat — Todo UI Plan (single-user, full CRUD)

- **Status:** Proposed
- **Date:** 2026-10-20
- **Ticket:** Jira **KAN-15** (epic KAN-11; relates to KAN-12 API, KAN-13 auth)
- **Scope:** A clean, usable todo UI for a single anonymous user — full CRUD — on
  top of the **existing** `/api/todos` API. **No auth, no backend changes.**
- **Companions:** [`frontend.md`](frontend.md), [`persistence-plan.md`](persistence-plan.md)
  (§11 Phase 6), [`manual-testing-todos.md`](manual-testing-todos.md).

---

## 1. Goal

Replace the current minimal `/todos` stub with a proper single-user todo app:

- create, list, **edit title**, toggle complete, delete
- filters (all / active / completed), counts, clear-completed
- real loading / empty / error states and pending states

This is the last piece before auth (KAN-13) adds per-user data on top.

## 2. Current state & gap

Shipped in KAN-12: `/todos` renders a list, an add form, a complete toggle, and
delete — no edit, no filters, minimal states. The API already supports everything
needed: `GET /api/todos`, `POST`, `PATCH { title?, completed? }`, `DELETE`.

So **KAN-15 is web-only**.

## 3. Scope

**In:** full CRUD incl. edit title; filters + counts; clear completed; empty /
loading / error / pending states; responsive + keyboard accessible.

**Out:** auth, per-user data, drag-and-drop, due dates, backend/API/schema changes,
multi-list/workspaces.

## 4. UX & decisions

| # | Decision | Choice (proposed) | Notes |
|---|----------|-------------------|-------|
| U1 | Edit interaction | **Inline edit** (click title → input → Enter to save, Esc to cancel) | Fast, no dialog; a Dialog can be added later |
| U2 | Delete | Immediate + optimistic, with **undo** (toast) | Falls back to no toast if we skip Sonner now |
| U3 | Filters | **Toggle group** (All/Active/Completed) + counts | Client-side filter over the list |
| U4 | Clear completed | A single action, shown when completed > 0 | `DELETE` each (or a bulk endpoint later) |
| U5 | Optimistic updates | Toggle + delete optimistic; create/edit pessimistic | Keeps UI snappy, avoids overstated success |
| U6 | Toasts | **Sonner** (shadcn default, `frontend.md`) for undo/errors | Optional; can defer |

Open questions are collected in §9.

## 5. Components (shadcn/ui, owned in-repo)

Add via `npx shadcn@latest add … -c apps/web`:

- `checkbox` — completion
- `label` — form labels
- `badge` — counts / filter pills
- `dialog` — (optional) confirm/undo or edit dialog
- `sonner` — toasts (if U6 adopted)

Existing: `button`, `input`. Keep everything in `components/ui/**` (owned;
`frontend.md` §3).

## 6. Structure

Follow `frontend.md` §5 (feature folders):

```
apps/web/src/
├── routes/
│   └── todos.tsx                 # thin: reads route, renders feature
├── features/todos/
│   ├── api.ts                    # list/create/update/delete (moved from lib/api)
│   ├── hooks.ts                  # useTodos, useCreateTodo, useToggleTodo, …
│   ├── types.ts                  # view types (filters)
│   └── components/
│       ├── todo-form.tsx
│       ├── todo-filters.tsx
│       ├── todo-list.tsx
│       ├── todo-item.tsx
│       └── todo-empty.tsx
└── lib/
    ├── api.ts                    # health only
    └── query-client.ts
```

## 7. Data layer (TanStack Query)

- Query key: `["todos"]` (centralized in `features/todos/hooks.ts`).
- Mutations invalidate `["todos"]`; optimistic for toggle/delete via `onMutate`
  (snapshot → update cache → rollback `onError` → `invalidate` `onSettled`).
- Errors surface via the existing query-cache `onError` hook (`lib/query-client.ts`)
  and the component error states.

## 8. Accessibility & responsive

- Every control labelled (`aria-label` / `<label>`), keyboard operable
  (add, edit, toggle, delete; Enter/Esc in inline edit).
- Focus management on inline edit; visible focus rings (shadcn defaults).
- `aria-live` for counts; list is a semantic `<ul>`.
- Single-column, mobile-first; comfortable tap targets.

## 9. Open questions

1. **Undo/delete:** immediate with undo (Sonner) vs a confirm dialog? (U2/U6)
2. **Optimistic create/edit** or pessimistic? (U5 — proposal: pessimistic)
3. **Filters now**, or keep to a count + clear-completed for the "basic" milestone?
4. **Feature folder** (`src/features/todos`) vs keeping route-local components?

## 10. Testing

- **E2E (Playwright)** — happy paths: create → edit title → toggle → delete;
  filters show the right subsets; empty state; error state (bad API).
- **Component/unit** — defer (RTL not set up); logic that matters is covered E2E.
- Worker integration tests are unchanged (API already covered).

## 11. Phases & effort

| Phase | Contents | Effort |
|-------|----------|--------|
| 1 | Feature folder refactor + hooks (no UI change) | ~1–2 h |
| 2 | Full CRUD UI incl. inline edit; states | ~3–5 h |
| 3 | Filters, counts, clear-completed (+ toasts) | ~2–3 h |
| 4 | E2E + a11y polish | ~2 h |

Lands through `verify` + a PR preview (`workflow-plan.md` W3); on merge it deploys
with the existing pipeline.

## 12. Approval matrix

| Item | Owner |
|------|-------|
| Component refactor, hooks, UI, tests | agent (PR review) |
| UX decisions U1–U6 / §9 | eng decision |
| Adding shadcn components (checkbox, label, badge, dialog, sonner) | agent |

## 13. References

- API: `GET/POST/PATCH/DELETE /api/todos` (KAN-12) — no changes required.
- `frontend.md` — stack + conventions (TanStack Query, RHF+Zod if forms grow).
- `manual-testing-todos.md` — how to verify across environments.
- Follow-ups: KAN-13 (auth), KAN-14 (web preview wiring).
