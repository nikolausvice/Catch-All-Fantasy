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
  const [failed, setFailed] = useState(false);

  if (avatarUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={fallbackClassName}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}
