import { cn } from "cn";
import { Link } from "react-router";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-[26px] shrink-0 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--primary),var(--brand-2))] text-sm font-extrabold text-primary-foreground shadow-[0_0_26px_-4px_var(--ring)]",
        className,
      )}
    >
      F
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "flex items-center gap-2.5 text-[17px] font-bold tracking-tight",
        className,
      )}
    >
      <BrandMark />
      Foonix
    </Link>
  );
}
