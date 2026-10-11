import { createRoot } from "react-dom/client";
import "../index.css";
import { LogoMark } from "../components/ui";
import { HeroSkyline } from "../components/art/scenes";

/*
 * Dev-only renderer for brand exports (served at /brand.html by `vite`, never built).
 *   ?asset=icon&size=512&bg=none|dark   mark centred on a square
 *   ?asset=lockup&bg=none|dark[&text=dark]  horizontal lockup, 1200x300
 *   ?asset=submission                   1024x1024 mark + wordmark on the dark canvas
 *   ?asset=og                           1200x630 social card
 */
const q = new URLSearchParams(location.search);
const asset = q.get("asset") ?? "og";
const size = Number(q.get("size") ?? 512);
const darkBg = q.get("bg") !== "none";

document.documentElement.style.background = darkBg || asset === "og" || asset === "submission" ? "var(--color-bg)" : "transparent";
document.body.style.background = "transparent";
document.body.style.margin = "0";

const darkText = q.get("text") === "dark";

function Wordmark({ px }: { px: number }) {
  return (
    <span className={`font-heading font-bold ${darkText ? "text-bg" : "text-fg"}`} style={{ fontSize: px, letterSpacing: "-0.035em", lineHeight: 1 }}>
      GpuHedger
    </span>
  );
}

function Icon() {
  // 10% padding so the mark survives rounded app-icon masks.
  return (
    <div style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
      <LogoMark size={Math.round(size * 0.8)} />
    </div>
  );
}

function Lockup() {
  return (
    <div style={{ width: 1200, height: 300, display: "flex", alignItems: "center", justifyContent: "center", gap: 36 }}>
      <LogoMark size={200} />
      <Wordmark px={150} />
    </div>
  );
}

function Submission() {
  return (
    <div style={{ width: 1024, height: 1024, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 56 }}>
      <LogoMark size={520} />
      <Wordmark px={120} />
    </div>
  );
}

function Og() {
  return (
    <div className="relative overflow-hidden bg-bg" style={{ width: 1200, height: 630 }}>
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_80%_90%_at_25%_30%,black_20%,transparent_75%)]" />
      <div className="absolute bottom-0 right-[-120px] top-[40px] w-[720px] [mask-image:linear-gradient(to_right,transparent,black_30%)]">
        <HeroSkyline className="h-full w-full" />
      </div>
      <div className="relative flex h-full flex-col justify-between p-[64px]">
        <div className="flex items-center gap-4">
          <LogoMark size={56} />
          <Wordmark px={40} />
        </div>
        <div>
          <div className="label text-[15px] text-primary">Onchain options on GPU compute · Monad</div>
          <div className="mt-5 font-heading font-semibold text-fg" style={{ fontSize: 84, lineHeight: 1.0, letterSpacing: "-0.035em" }}>
            Hedge the future
            <br />
            of <span className="text-primary">compute.</span>
          </div>
        </div>
        <div className="flex gap-8 font-mono text-[15px] uppercase tracking-[0.08em] text-muted">
          <span>Cap your H100 bill</span>
          <span>·</span>
          <span>Fully collateralized</span>
          <span>·</span>
          <span>Settles in ~1s</span>
        </div>
      </div>
    </div>
  );
}

const view = { icon: <Icon />, lockup: <Lockup />, submission: <Submission />, og: <Og /> }[asset] ?? <Og />;
createRoot(document.getElementById("root")!).render(view);
// Signal for the export script: fonts loaded and first paint done.
document.fonts.ready.then(() => requestAnimationFrame(() => document.body.setAttribute("data-ready", "1")));
