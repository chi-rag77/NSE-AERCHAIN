import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  height?: number;
  alt?: string;
}

/**
 * Aerchain brand mark (the orange "Ai" icon).
 *
 * Loads the committed brand asset, trying PNG then SVG, and falls back to the
 * bundled drawn icon so the UI never breaks if the file isn't present yet.
 *
 * To use the real logo: commit it as ONE of:
 *   public/logos/aerchain-logo.png   (preferred for a raster export)
 *   public/logos/aerchain-logo.svg   (preferred if you have a vector)
 */
const SOURCES = [
  "/logos/aerchain-logo.png",
  "/logos/aerchain-logo.svg",
  "/logos/aerchain.svg", // last-resort bundled fallback
];

export const AerchainLogo = ({ className, height = 30, alt = "Aerchain" }: Props) => {
  const [idx, setIdx] = useState(0);
  return (
    <img
      src={SOURCES[idx]}
      alt={alt}
      height={height}
      style={{ height, width: "auto", display: "block" }}
      className={cn("shrink-0", className)}
      onError={() => setIdx((i) => Math.min(i + 1, SOURCES.length - 1))}
    />
  );
};
