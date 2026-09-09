import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings";
import {
  MAX_SITE_DESCRIPTION_LENGTH,
  MAX_SITE_LOGO_BYTES,
  MAX_SITE_NAME_LENGTH,
  SITE_ACCENT_COLORS,
  SITE_LOGO_MIME_TYPES,
} from "@/lib/site-settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fieldsSchema = z.object({
  siteName: z.string().trim().min(1, "网站名称不能为空").max(MAX_SITE_NAME_LENGTH, `网站名称最多 ${MAX_SITE_NAME_LENGTH} 个字符`),
  siteDescription: z.string().trim().max(MAX_SITE_DESCRIPTION_LENGTH, `网站说明最多 ${MAX_SITE_DESCRIPTION_LENGTH} 个字符`),
  accentColor: z.enum(SITE_ACCENT_COLORS).optional(),
  logoAction: z.enum(["keep", "remove"]).default("keep"),
});

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;
  return NextResponse.json(getSiteSettings());
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const formData = await request.formData();
    const accentColor = formData.get("accentColor");
    const parsed = fieldsSchema.safeParse({
      siteName: formData.get("siteName"),
      siteDescription: formData.get("siteDescription") ?? "",
      accentColor: typeof accentColor === "string" && accentColor ? accentColor : undefined,
      logoAction: formData.get("logoAction") ?? "keep",
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "基础设置数据不正确" }, { status: 400 });
    }

    const logoEntry = formData.get("logo");
    let logo: { mimeType: string; base64: string } | null | undefined;

    if (logoEntry && typeof logoEntry !== "string" && logoEntry.size > 0) {
      if (logoEntry.size > MAX_SITE_LOGO_BYTES) {
        return NextResponse.json({ error: "站点图标不能超过 1 MB" }, { status: 400 });
      }
      if (!SITE_LOGO_MIME_TYPES.includes(logoEntry.type as (typeof SITE_LOGO_MIME_TYPES)[number])) {
        return NextResponse.json({ error: "站点图标仅支持 PNG、JPG/JPEG 或 WebP" }, { status: 400 });
      }
      logo = {
        mimeType: logoEntry.type,
        base64: Buffer.from(await logoEntry.arrayBuffer()).toString("base64"),
      };
    } else if (parsed.data.logoAction === "remove") {
      logo = null;
    }

    return NextResponse.json(saveSiteSettings({
      siteName: parsed.data.siteName,
      siteDescription: parsed.data.siteDescription,
      accentColor: parsed.data.accentColor,
      logo,
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "基础设置保存失败" }, { status: 400 });
  }
}
