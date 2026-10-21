const links = [
  { href: "/api/docs", label: "Docs" },
  { href: "/api/health", label: "Status" },
  { href: "https://github.com/saxeum/numbat", label: "GitHub", external: true },
] as const;

const year = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-10 text-sm text-muted-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <p>© {year} Foonix · Built on Cloudflare Workers</p>
        <nav className="flex items-center gap-6">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={"external" in link ? "_blank" : undefined}
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
