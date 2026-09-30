import type { FontKey } from "@/db/schema";

/** Self-hosted via @fontsource (no request to Google → no GDPR issue with Google Fonts). */
export const FONTS: Record<FontKey, { label: string; stack: string }> = {
  inter: { label: "Inter", stack: "'Inter', system-ui, sans-serif" },
  poppins: { label: "Poppins", stack: "'Poppins', system-ui, sans-serif" },
  montserrat: { label: "Montserrat", stack: "'Montserrat', system-ui, sans-serif" },
  playfair: { label: "Playfair Display", stack: "'Playfair Display', Georgia, serif" },
  roboto: { label: "Roboto", stack: "'Roboto', system-ui, sans-serif" },
  lato: { label: "Lato", stack: "'Lato', system-ui, sans-serif" },
  oswald: { label: "Oswald", stack: "'Oswald', Impact, sans-serif" },
  dmsans: { label: "DM Sans", stack: "'DM Sans', system-ui, sans-serif" },
};

export function fontStack(key: FontKey | undefined): string {
  return (key && FONTS[key]?.stack) || FONTS.inter.stack;
}
