import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";

import { signOut, useSession } from "../client";

export function UserMenu() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  if (!session) return null;

  async function onSignOut() {
    await signOut();
    queryClient.clear();
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground" title={session.user.email}>
        {session.user.name || session.user.email}
      </span>
      <Button variant="outline" size="sm" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  );
}
