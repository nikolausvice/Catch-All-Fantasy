"use client";

import { useState } from "react";

export function AvatarImage({
  name,
  avatarUrl,
  className,
  fallbackClassName,
}: {
  name: string;
  avatarUrl: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!avatarUrl || failed) {
    return (
      <div className={fallbackClassName}>
        {name[0]?.toUpperCase() ?? "?"}
      </div>
    );
  }

  // The letter fallback stays mounted underneath, and the <img> only fades
  // in once it's actually finished loading. A plain <img> whose src is slow
  // or transiently unreachable (e.g. right after a refresh, before a
  // platform's CDN responds) shows the browser's own broken-image glyph for
  // a beat before onError ever fires — keeping it invisible (not unmounted)
  // until onLoad confirms success means that glyph never gets painted; the
  // fallback letter is visible underneath the whole time instead.
  return (
    <div className={`relative ${className ?? ""}`}>
      <div className={`absolute inset-0 ${fallbackClassName ?? ""}`}>
        {name[0]?.toUpperCase() ?? "?"}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl}
        alt=""
        className={`absolute inset-0 ${className ?? ""}`}
        style={{ opacity: loaded ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
