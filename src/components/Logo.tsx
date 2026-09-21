import Image from "next/image";

/**
 * The SkillArena mark: the geometric icon (a color PNG, transparent - the
 * source wordmark asset had no alpha channel and baked-in dark background,
 * which is what produced the unwanted gray/black box around the logo; this
 * crop had its background removed) plus the wordmark rendered as real text,
 * not a raster image. That's deliberate, not a shortcut - the source
 * wordmark is white-on-black-only, so it would be invisible in light mode.
 * Real text stays sharp at any size and adopts the current theme's
 * foreground color automatically (or `currentColor` via className).
 *
 * - "full": icon + "SkillArena" text - use standalone, where nothing else
 *   already says the product name (login screens, homepage hero, pre-quiz).
 * - "mark": just the icon - use next to a separate text label in tight nav
 *   bars (the full lockup would otherwise duplicate the adjacent text).
 */
export function Logo({
  size = 40,
  variant = "full",
  className = "",
  priority = false,
}: {
  size?: number;
  variant?: "full" | "mark";
  className?: string;
  priority?: boolean;
}) {
  const icon = (
    <Image
      src="/brand/skillarena-mark.png"
      alt={variant === "mark" ? "SkillArena" : ""}
      width={size}
      height={size}
      priority={priority}
      className="inline-block shrink-0"
    />
  );

  if (variant === "mark") {
    return <span className={`inline-flex ${className}`}>{icon}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {icon}
      <span
        className="font-black uppercase leading-none tracking-tight text-foreground"
        style={{ fontSize: size * 0.62 }}
      >
        SkillArena
      </span>
    </span>
  );
}
