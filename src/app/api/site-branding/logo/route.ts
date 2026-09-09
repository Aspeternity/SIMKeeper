import { getSiteLogo } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const logo = getSiteLogo();
  if (!logo) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
