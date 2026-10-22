import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  ClipboardList,
  FileText,
  GitBranch,
  KeyRound,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";

import { Brand, BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { useSession, signOut } from "@/features/auth/client";
import { ConversationList } from "@/features/chat/components/ConversationList";
import {
  useConversations,
  useDeleteConversation,
  useRenameConversation,
} from "@/features/chat/hooks";

interface NavItem {
  to?: string;
  href?: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}

const gatewayNav: NavItem[] = [
  { to: "/gateway/chat", label: "Chat", icon: MessageSquare },
  { to: "/gateway/credentials", label: "Provider credentials", icon: KeyRound },
  { to: "/gateway/reports", label: "Reports", icon: ClipboardList },
  { to: "/gateway/tokens", label: "API tokens", icon: Terminal },
];

const resourceNav: NavItem[] = [
  { to: "/guide", label: "Guide", icon: BookOpen },
  { href: "/api/docs", label: "Docs", icon: FileText },
  { to: "/status", label: "Status", icon: Activity },
  {
    href: "https://github.com/saxeum/numbat",
    label: "GitHub",
    icon: GitBranch,
    external: true,
  },
];

function SidebarNavItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const className = cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
    collapsed && "justify-center px-0 py-2.5",
    "text-muted-foreground hover:bg-accent hover:text-foreground",
  );
  const content = (
    <>
      <item.icon className="size-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </>
  );

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            collapsed && "justify-center px-0 py-2.5",
            isActive
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )
        }
      >
        {content}
      </NavLink>
    );
  }

  return (
    <a
      href={item.href}
      target={item.external ? "_blank" : undefined}
      rel="noreferrer"
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={className}
    >
      {content}
    </a>
  );
}

function SidebarAccount({ collapsed }: { collapsed: boolean }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  if (!session) {
    if (collapsed) {
      return (
        <Link
          to="/gateway"
          title="Sign in"
          aria-label="Sign in"
          className="mx-auto grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LogOut className="size-4 rotate-180" />
        </Link>
      );
    }
    return (
      <Button asChild size="sm" className="w-full">
        <Link to="/gateway">Sign in</Link>
      </Button>
    );
  }

  async function onSignOut() {
    await signOut();
    queryClient.clear();
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onSignOut}
        title={session.user.email}
        aria-label="Sign out"
        className="mx-auto grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <LogOut className="size-4" />
      </button>
    );
  }

  const name = session.user.name || session.user.email;
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
        {name.slice(0, 1)}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
        title={session.user.email}
      >
        {name}
      </span>
      <button
        type="button"
        onClick={onSignOut}
        aria-label="Sign out"
        className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  );
}

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  /** Hide the collapse/expand control when the width is forced. */
  toggleable?: boolean;
}

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  toggleable = true,
}: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authed = Boolean(session);

  const onChat = pathname.startsWith("/gateway/chat");
  const conversationId = onChat ? pathname.split("/")[3] : undefined;
  // Keep the recent chats visible on every screen once signed in.
  const conversations = useConversations(authed);
  const renameConversation = useRenameConversation();
  const deleteConversation = useDeleteConversation();

  function newChat() {
    onNavigate?.();
    navigate("/gateway/chat");
  }

  function onDelete(id: string) {
    deleteConversation.mutate(id);
    if (id === conversationId) navigate("/gateway/chat");
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar",
        collapsed ? "w-14" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center",
          collapsed ? "justify-center" : "justify-between px-3",
        )}
      >
        {collapsed ? (
          <Link to="/" aria-label="Foonix home">
            <BrandMark />
          </Link>
        ) : (
          <Brand />
        )}
        {!collapsed && toggleable ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <PanelLeftClose className="size-4" />
          </button>
        ) : null}
      </div>

      {collapsed && toggleable ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="mx-auto mb-1 grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-2">
        <button
          type="button"
          onClick={newChat}
          title={collapsed ? "New chat" : undefined}
          aria-label={collapsed ? "New chat" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            collapsed && "justify-center px-0",
          )}
        >
          <Plus className="size-4 shrink-0" />
          {!collapsed ? "New chat" : null}
        </button>

        {!collapsed && authed ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            <ConversationList
              conversations={conversations.data ?? []}
              activeId={conversationId}
              onRename={(id, title) => renameConversation.mutate({ id, title })}
              onDelete={onDelete}
              onNavigate={onNavigate}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1" />
        )}

        <nav className="flex flex-col gap-1 pb-1">
          {!collapsed ? (
            <p className="px-2 pt-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Gateway
            </p>
          ) : null}
          {gatewayNav.map((item) => (
            <SidebarNavItem
              key={item.label}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
          {!collapsed ? (
            <p className="px-2 pt-3 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Resources
            </p>
          ) : (
            <div className="my-1 border-t border-border" />
          )}
          {resourceNav.map((item) => (
            <SidebarNavItem
              key={item.label}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-t border-border",
          collapsed ? "flex-col px-2 py-3" : "px-3 py-3",
        )}
      >
        <div className={cn(collapsed ? "" : "min-w-0 flex-1")}>
          <SidebarAccount collapsed={collapsed} />
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
