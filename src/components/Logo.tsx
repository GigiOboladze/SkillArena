import Image from "next/image";

// Official SkillArena brand assets (public/brand). All are transparent PNG
// derivatives of the supplied logo - originals are kept untouched in
// brand-source/. The supplied SVG only wraps the same raster image, so these
// are not vector art and are sized for up to ~3x display density.
//
//  - skillarena-logo.png        full lockup, "Skill" white  -> dark theme
//  - skillarena-logo-light.png  same lockup, "Skill" in deep ink -> light theme
//                               (white text would be invisible on light)
//  - skillarena-mark.png        the emblem alone
const FULL_RATIO = 780 / 178;
const MARK_RATIO = 282 / 237;

/**
 * - "full": emblem + wordmark lockup. `size` is the rendered height in px.
 * - "mark": emblem only, for tight spots next to a separate text label.
 *   `size` is the rendered height in px.
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
  if (variant === "mark") {
    return (
      <span className={`inline-flex ${className}`}>
        <Image
          src="/brand/skillarena-mark.png"
          alt="SkillArena"
          width={Math.round(size * MARK_RATIO)}
          height={size}
          priority={priority}
          className="inline-block shrink-0"
        />
      </span>
    );
  }

  const width = Math.round(size * FULL_RATIO);
  return (
    <span className={`sa-logo inline-flex ${className}`} style={{ width, height: size }}>
      <Image
        src="/brand/skillarena-logo.png"
        alt="SkillArena"
        width={width}
        height={size}
        priority={priority}
        className="sa-logo-on-dark"
      />
      <Image
        src="/brand/skillarena-logo-light.png"
        alt=""
        aria-hidden
        width={width}
        height={size}
        priority={priority}
        className="sa-logo-on-light"
      />
    </span>
  );
}
