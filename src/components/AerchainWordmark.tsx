import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** Height in px — drives font-size proportionally */
  height?: number;
  /** When on a dark background, render dark letters in white */
  inverted?: boolean;
}

/**
 * Aerchain wordmark: AERCH (dark) + Ai (brand orange) + N (dark).
 * Rendered as a styled span so the font always matches the surrounding
 * UI and dark-mode toggling works without an extra SVG file.
 */
export const AerchainWordmark = ({ className, height = 22, inverted = false }: Props) => {
  const dark = inverted ? "text-white" : "text-[#1A1A1A] dark:text-white";
  return (
    <span
      className={cn("inline-flex items-baseline select-none", className)}
      style={{
        fontFamily: "'Plus Jakarta Sans', 'Futura', 'Arial Black', sans-serif",
        fontWeight: 800,
        fontSize: height,
        letterSpacing: "-0.01em",
        lineHeight: 1,
      }}
    >
      <span className={dark}>AERCH</span>
      <span style={{ color: "#E8431C" }}>Ai</span>
      <span className={dark}>N</span>
    </span>
  );
};
