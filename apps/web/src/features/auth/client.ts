import { createAuthClient } from "better-auth/react";

// Better Auth requires an absolute base URL; derive it from the current origin
// (same-origin in prod/local, proxied on previews).
export const authClient = createAuthClient({
  baseURL: new URL("/api/auth", window.location.origin).toString(),
});

export const { useSession, signIn, signUp, signOut } = authClient;
