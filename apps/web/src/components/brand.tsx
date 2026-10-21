import { cn } from "cn";
import { Link } from "react-router";

/** An asymmetric blob mark with a subtle gradient. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mark inline-block size-5 shrink-0", className)}
      style={{ borderRadius: "78% 22% 48% 52% / 34% 72% 28% 66%" }}
    />
  );
}

/** Slowly rotating, morphing blob (empty state). */
export function AnimatedMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("mark mark-blob inline-block size-12", className)}
    />
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "flex items-center gap-2 text-[15px] font-semibold tracking-tight",
        className,
      )}
    >
      <BrandMark className="size-[18px]" />
      Foonix
    </Link>
  );
}
