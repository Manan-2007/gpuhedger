import { useEffect, useState } from "react";
import { chainNow } from "../lib/clock";

/** Current time in ms, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 1_000) {
  const [now, setNow] = useState(() => chainNow());
  useEffect(() => {
    const id = setInterval(() => setNow(chainNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
