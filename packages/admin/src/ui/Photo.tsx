/**
 * A member's Telegram profile photo laid over an initial-letter avatar. The
 * parent keeps its initials; the photo covers them once it loads and removes
 * itself if there is none (the API answers 404).
 */
import { useState } from "react";
import { apiUrl } from "../lib/api.js";

export function PhotoFill({ path }: { path: string | null | undefined }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!path || failed === path) return null;
  return (
    <img
      src={apiUrl(path)}
      alt=""
      loading="lazy"
      onError={() => setFailed(path)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
    />
  );
}
