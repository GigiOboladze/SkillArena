import QRCode from "qrcode";

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Builds the public URL students scan / open to join a homework. */
export function joinUrlForCode(joinCode: string): string {
  return `${baseUrl()}/join/${joinCode}`;
}

/** Builds the public URL players scan / open to join a HootArena game - lands straight on the nickname-entry screen, PIN already filled in. */
export function hootJoinUrlForPin(pin: string): string {
  return `${baseUrl()}/hootarena/join/${pin}`;
}

async function toQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 2,
    width: 320,
    color: {
      dark: "#5B3DF0",
      light: "#FFFFFF",
    },
  });
}

/**
 * Renders the join link as a scannable QR code (PNG data URL) for the admin
 * panel. Modules are the darker brand violet on a plain white background -
 * violet-on-white still keeps contrast high enough to scan reliably, which
 * a fully violet-on-black treatment would not.
 */
export async function generateJoinQrDataUrl(joinCode: string): Promise<string> {
  return toQrDataUrl(joinUrlForCode(joinCode));
}

/** Same rendering as generateJoinQrDataUrl, pointed at a HootArena game's PIN-prefilled join link instead. */
export async function generateHootJoinQrDataUrl(pin: string): Promise<string> {
  return toQrDataUrl(hootJoinUrlForPin(pin));
}
