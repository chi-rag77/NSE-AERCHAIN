import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** Font size in px for the wordmark text */
  height?: number;
  /** On dark backgrounds, render the dark letters in white */
  inverted?: boolean;
}

/**
 * Aerchain wordmark: AERCH (dark) + [orange Ai glyph] + N (dark).
 *
 * The orange "Ai" section is an inline SVG that reproduces the brand's
 * rounded open-A loop with a detached i-dot, sized to match the cap-height
 * of the surrounding text.
 */
export const AerchainWordmark = ({ className, height = 22, inverted = false }: Props) => {
  const letterColor = inverted ? "#FFFFFF" : "#1A1A1A";

  // The glyph viewport is 68 × 80 (w × h); we scale it to `height` px tall.
  const glyphH = height * 1.05;
  const glyphW = glyphH * (68 / 80);

  return (
    <span
      className={cn("inline-flex items-center select-none", className)}
      style={{
        fontFamily: "'Plus Jakarta Sans','Futura','Century Gothic','Arial Black',sans-serif",
        fontWeight: 800,
        fontSize: height,
        letterSpacing: "-0.01em",
        lineHeight: 1,
        color: letterColor,
      }}
    >
      {/* ── Dark letters: AERCH ── */}
      <span style={{ color: letterColor }}>AERCH</span>

      {/* ── Orange Ai glyph ── */}
      <svg
        width={glyphW}
        height={glyphH}
        viewBox="0 0 68 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "inline-block", verticalAlign: "middle", margin: "0 1px" }}
        aria-hidden
      >
        {/*
          Rounded open-A:
          - Left leg starts bottom-left, curves up to a rounded apex
          - Right leg comes back down and ends open (no closure at bottom-right)
          - A crossbar sits ~55% from top
          Traced from the Aerchain brand mark.
        */}
        <path
          d="M 9 72
             C 4 68  3 58  7 46
             L 18 16
             C 22  5  31  1  40  4
             C 49  7  53 17  50 30
             L 40 64
             C 38 70  33 76  26 74"
          stroke="#E8431C"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Crossbar */}
        <line
          x1="13" y1="46"
          x2="48" y2="46"
          stroke="#E8431C"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* i dot — upper-right, detached */}
        <circle cx="62" cy="10" r="7" fill="#E8431C" />
      </svg>

      {/* ── Dark letter: N ── */}
      <span style={{ color: letterColor }}>N</span>
    </span>
  );
};
