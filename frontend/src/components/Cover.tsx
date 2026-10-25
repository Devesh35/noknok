"use client";

import { useState } from "react";
import { CATEGORY_META, coverEmoji, coverFor } from "@/lib/activity";
import type { Activity } from "@/lib/types";

// Activity cover: the photo from coverUrl over a category gradient. The
// gradient and emoji show through while the photo loads, or if it is missing.
export function Cover({
  activity,
  className = "",
  emojiClassName = "text-5xl",
  float = false,
}: {
  activity: Pick<Activity, "category" | "coverUrl" | "title"> &
    Partial<Pick<Activity, "subcategory">>;
  className?: string;
  emojiClassName?: string;
  float?: boolean;
}) {
  const meta = CATEGORY_META[activity.category];
  const [failed, setFailed] = useState(false);
  // No photo of its own: the stock one for the sub-activity. The emoji only
  // shows if that fails to load too.
  const src =
    activity.coverUrl || coverFor(activity.category, activity.subcategory);
  const hasPhoto = !failed;

  return (
    <div
      className={`relative isolate flex items-center justify-center overflow-hidden bg-linear-to-br ${meta.gradient} ${className}`}
      aria-hidden="true"
    >
      {hasPhoto ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out-soft group-hover:scale-110"
          />
          {/* Darkens the edges so badges and overlay buttons stay readable. */}
          <span className="absolute inset-0 bg-linear-to-b from-black/35 via-transparent to-black/30" />
        </>
      ) : (
        <>
          <span className="absolute -top-1/3 -left-1/4 -z-10 h-full w-2/3 rounded-full bg-white/30 blur-2xl" />
          <span className="absolute -right-1/4 -bottom-1/2 -z-10 h-full w-2/3 rounded-full bg-black/20 blur-2xl" />
          <span className={float ? "animate-float" : ""}>
            <span
              className={`block drop-shadow-lg transition-transform duration-500 ease-spring group-hover:scale-125 group-hover:-rotate-6 ${emojiClassName}`}
            >
              {coverEmoji(activity.category, activity.subcategory)}
            </span>
          </span>
        </>
      )}
    </div>
  );
}
