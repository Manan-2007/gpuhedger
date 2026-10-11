import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MiniCluster } from "./art/scenes";

/*
 * Design primitives for the Monad-style language: flat hairline cards, mono uppercase labels,
 * small radii, solid lime actions with a trailing arrow. Everything else is built from these.
 */

export function Card({ className = "", children, as: As = "div", ...rest }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" } & Record<string, unknown>) {
  return (
    <As className={`panel ${className}`} {...rest}>
      {children}
    </As>
  );
}

/** "NEXT STEPS"-style label. */
export function MonoLabel({ children, className = "", as: As = "span" }: { children: ReactNode; className?: string; as?: "span" | "div" | "dt" | "h2" | "h3" }) {
  return <As className={`label ${className}`}>{children}</As>;
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

type ButtonVariant = "primary" | "outline" | "ghost";
const VARIANT: Record<ButtonVariant, string> = { primary: "btn-primary", outline: "btn-secondary", ghost: "btn-ghost" };

export function Button({
  variant = "primary",
  arrow = false,
  className = "",
  children,
  ...rest
}: { variant?: ButtonVariant; arrow?: boolean; className?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${VARIANT[variant]} ${className}`} {...rest}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}

export function ButtonLink({ to, variant = "primary", arrow = false, className = "", children }: { to: string; variant?: ButtonVariant; arrow?: boolean; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`${VARIANT[variant]} ${className}`}>
      {children}
      {arrow && <Arrow />}
    </Link>
  );
}

type Tone = "neutral" | "lime" | "teal" | "red" | "blue" | "purple" | "amber";
const TONE: Record<Tone, string> = {
  neutral: "border-line-2 text-muted",
  lime: "border-primary/45 text-primary",
  teal: "border-pos/45 bg-pos/10 text-pos",
  red: "border-neg/45 text-neg",
  blue: "border-secondary/45 text-secondary",
  purple: "border-put/45 text-put",
  amber: "border-warn/45 bg-warn/10 text-warn",
};

/** Outlined mono tag. */
export function Chip({ tone = "neutral", className = "", children, title }: { tone?: Tone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span className={`chip ${TONE[tone]} ${className}`} title={title}>
      {children}
    </span>
  );
}

/** Big numeral with a mono label. */
export function Stat({
  label,
  value,
  sub,
  tag,
  valueClass = "",
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tag?: ReactNode;
  valueClass?: string;
  size?: "md" | "lg";
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <MonoLabel>{label}</MonoLabel>
        {tag}
      </div>
      <div className={`num mt-2 font-heading font-semibold tracking-tight ${size === "lg" ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl"} ${valueClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-line ${className}`} />;
}

/** Mono eyebrow → big title → one-line description, with optional right-side content. */
export function SectionHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <MonoLabel as="div" className="mb-3 text-primary">{eyebrow}</MonoLabel>}
        <h1 className="font-heading text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action, art }: { title: string; body?: ReactNode; action?: ReactNode; art?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {art ?? <MiniCluster className="mb-5 h-20 w-auto" />}
      <h3 className="font-heading text-lg font-semibold">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
