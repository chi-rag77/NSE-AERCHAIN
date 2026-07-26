import { useState } from "react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/hooks/useBranding";

interface Props {
  className?: string;
  height?: number;
  alt?: string;
}

/**
 * Aerchain brand mark.
 *
 * Priority:
 *   1. Admin-uploaded logo (Admin → Branding), stored as a base64 data URI.
 *   2. A committed brand asset — public/logos/aerchain-logo.png|svg.
 *   3. The bundled drawn icon, so the UI never breaks.
 */
const FILE_SOURCES = [
  "/logos/aerchain-logo.png",
  "/logos/aerchain-logo.svg",
  "/logos/aerchain.svg", // last-resort bundled fallback
];

export const AerchainLogo = ({ className, height = 30, alt = "Aerchain" }: Props) => {
  const { logo } = useBranding();
  const [uploadedFailed, setUploadedFailed] = useState(false);
  const [fileIdx, setFileIdx] = useState(0);

  const useUploaded = !!logo && !uploadedFailed;
  const src = useUploaded ? logo! : FILE_SOURCES[fileIdx];

  return (
    <img
      // Re-mount when the source category changes so the fallback chain is clean.
      key={useUploaded ? "uploaded" : `file-${fileIdx}`}
      src={src}
      alt={alt}
      height={height}
      style={{ height, width: "auto", maxWidth: "100%", display: "block" }}
      // self-start stops a flex column (e.g. the login brand panel) from
      // stretching the logo to full width and distorting it.
      className={cn("shrink-0 self-start", className)}
      onError={() => {
        // Broken uploaded logo → drop through to the committed/bundled files.
        if (useUploaded) setUploadedFailed(true);
        else setFileIdx((i) => Math.min(i + 1, FILE_SOURCES.length - 1));
      }}
    />
  );
};
