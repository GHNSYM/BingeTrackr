import { CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  variant: "error" | "success";
  children: React.ReactNode;
  className?: string;
};

/**
 * Inline alert for auth form feedback. Replaces a bare coloured `<p>` — a
 * flat line of red text reads the same whether it means "bad email", "wrong
 * password", or "you already have an account", which is exactly the
 * distinction the signup form needs to draw for the already-registered case.
 */
export function AuthAlert({ variant, children, className }: Props) {
  const isError = variant === "error";
  const Icon = isError ? CircleAlert : CheckCircle2;

  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm",
        className,
      )}
      style={{
        background: isError
          ? "color-mix(in srgb, var(--status-dropped) 12%, transparent)"
          : "color-mix(in srgb, var(--status-completed) 14%, transparent)",
        color: isError ? "var(--status-dropped)" : "var(--status-completed)",
      }}
    >
      <Icon size={16} className="shrink-0 mt-0.5" />
      <span className="leading-snug">{children}</span>
    </div>
  );
}
