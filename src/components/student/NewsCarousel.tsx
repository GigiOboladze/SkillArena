"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/news";

/**
 * Rotating "Cool News!!" card: shows each item for `intervalMs`, then
 * cross-fades to the next and loops forever. The dots jump straight to an
 * item (and restart its timer).
 */
export function NewsCarousel({ items, intervalMs }: { items: NewsItem[]; intervalMs: number }) {
  const [index, setIndex] = useState(0);
  // Bumped on a manual jump so the effect below restarts the timer.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % items.length), intervalMs);
    return () => window.clearInterval(id);
  }, [items.length, intervalMs, tick]);

  if (items.length === 0) {
    return <div className="sa-news-frame grid place-items-center text-sm text-rahoot-muted">No news yet.</div>;
  }

  return (
    <div className="sa-news-frame" aria-roledescription="carousel" aria-label="Cool News">
      {items.map((item, i) => (
        <figure
          key={item.id}
          className={`sa-news-slide ${i === index ? "is-active" : ""} is-${item.fit}`}
          aria-hidden={i !== index}
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${items.length}`}
        >
          {item.fit === "contain" && (
            // Blurred copy behind a "contain" image so the card is never empty at the edges.
            // eslint-disable-next-line @next/next/no-img-element -- static public asset
            <img src={item.image} alt="" className="sa-news-backdrop" aria-hidden />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- static public asset */}
          <img src={item.image} alt={item.alt} className="sa-news-img" loading={i === 0 ? "eager" : "lazy"} />
          <figcaption className="sr-only">{item.title}</figcaption>
        </figure>
      ))}
      {items.length > 1 && (
        <div className="sa-news-dots">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={i === index ? "is-active" : undefined}
              aria-label={`Show news ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              onClick={() => {
                setIndex(i);
                setTick((t) => t + 1);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
