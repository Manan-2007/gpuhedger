import { useEffect, useState } from "react";
import { formatUsd } from "../utils/formatters";

/** Phone-only bar that jumps to the order ticket. Hides itself once the ticket is on screen. */
export function StickyOrderBar({ total, targetId = "trade-panel" }: { total: number; targetId?: string }) {
  const [ticketVisible, setTicketVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setTicketVisible(entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  if (ticketVisible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 p-3 backdrop-blur lg:hidden">
      <a href={`#${targetId}`} className="btn-primary w-full py-3">
        REVIEW ORDER · {formatUsd(total)}
      </a>
    </div>
  );
}
