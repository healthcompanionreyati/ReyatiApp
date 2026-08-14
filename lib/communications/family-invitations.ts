import { foundationFlags } from "@/lib/foundation-flags";

function base64Url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signingKey() {
  const { env } = await import("cloudflare:workers");
  const value = env.FAMILY_INVITATION_SIGNING_KEY?.trim();
  if (!value || value.length < 32) throw new Error("family_invitation_not_configured");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(value), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function familyInvitationDeliveryAvailable() {
  if (!foundationFlags.outboundEmailDelivery) return false;
  try {
    const { env } = await import("cloudflare:workers");
    const appUrl = new URL(env.REYATI_APP_URL ?? "");
    if (appUrl.protocol !== "https:" || !env.RESEND_API_KEY?.trim() || !env.RESEND_FROM_EMAIL?.trim()) return false;
    await signingKey();
    return true;
  } catch { return false; }
}

export async function signedFamilyInvitationToken(invitationId: string) {
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(invitationId));
  return `${invitationId}.${base64Url(signature)}`;
}

export async function signedFamilyInvitationPath(invitationId: string) {
  return `/family?invitation=${encodeURIComponent(await signedFamilyInvitationToken(invitationId))}`;
}

export async function verifiedFamilyInvitationId(token: string) {
  const separator = token.lastIndexOf(".");
  const invitationId = token.slice(0, separator); const signature = token.slice(separator + 1);
  if (!invitationId || !signature || invitationId.length > 128 || signature.length > 128) return null;
  const normalized = signature.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  let signatureBytes: ArrayBuffer;
  try { signatureBytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)).buffer as ArrayBuffer; } catch { return null; }
  try {
    const valid = await crypto.subtle.verify("HMAC", await signingKey(), signatureBytes, new TextEncoder().encode(invitationId));
    return valid ? invitationId : null;
  } catch { return null; }
}
