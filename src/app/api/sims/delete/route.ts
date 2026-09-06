import { and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, sqlite } from "@/db";
import { carriers, simBoundServices, simCards, simTariffs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getCountryRegion } from "@/lib/countries";
import { createSimArchive } from "@/lib/sim-archives";
import type { DeletedSimBindingSummary } from "@/lib/sim-archive-types";
import { getIdentityDocumentTypeLabel } from "@/lib/sim-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resolutionSchema = z.object({
  id: z.coerce.number().int().positive("绑定记录 ID 无效"),
  action: z.enum(["migrate", "delete"]),
  targetSimId: z.coerce.number().int().positive("目标号码无效").optional(),
});

const deleteSchema = z
  .object({
    simId: z.coerce.number().int().positive("号码 ID 无效"),
    bindings: z.array(resolutionSchema).default([]),
    preserveSnapshot: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    const ids = new Set<number>();
    value.bindings.forEach((resolution, index) => {
      if (ids.has(resolution.id)) {
        context.addIssue({ code: "custom", path: ["bindings", index, "id"], message: "同一绑定记录不能重复处理" });
      }
      ids.add(resolution.id);
      if (resolution.action === "migrate" && !resolution.targetSimId) {
        context.addIssue({ code: "custom", path: ["bindings", index, "targetSimId"], message: "迁移绑定时请选择目标号码" });
      }
    });
  });

class BindingResolutionError extends Error {}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
  return null;
}

function getActiveBindings(simId: number) {
  return db
    .select({ id: simBoundServices.id, serviceName: simBoundServices.serviceName })
    .from(simBoundServices)
    .where(and(eq(simBoundServices.simId, simId), eq(simBoundServices.status, "active")))
    .orderBy(asc(simBoundServices.id))
    .all();
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "删除请求不正确" }, { status: 400 });
  }

  const { simId, bindings: resolutions, preserveSnapshot } = parsed.data;

  try {
    const result = sqlite.transaction(() => {
      const source = db
        .select({
          id: simCards.id,
          label: simCards.label,
          phoneNumber: simCards.phoneNumber,
          simType: simCards.simType,
          iccid: simCards.iccid,
          balance: simCards.balance,
          currencyCode: simCards.currencyCode,
          activationDate: simCards.activationDate,
          validUntil: simCards.validUntil,
          identityStatus: simCards.identityStatus,
          identityName: simCards.identityName,
          identityDocumentType: simCards.identityDocumentType,
          identityDocumentTypeCustom: simCards.identityDocumentTypeCustom,
          identityCountryCode: simCards.identityCountryCode,
          notes: simCards.notes,
          carrierName: carriers.name,
          country: carriers.country,
          countryCode: carriers.countryCode,
          tariffPlanName: simTariffs.planName,
        })
        .from(simCards)
        .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
        .leftJoin(simTariffs, eq(simTariffs.simId, simCards.id))
        .where(eq(simCards.id, simId))
        .get();
      if (!source) throw new Error("号码不存在");

      const activeBindings = getActiveBindings(simId);
      const activeIds = new Set(activeBindings.map((binding) => binding.id));
      const resolutionIds = new Set(resolutions.map((resolution) => resolution.id));

      if (
        activeBindings.length !== resolutions.length ||
        activeBindings.some((binding) => !resolutionIds.has(binding.id)) ||
        resolutions.some((resolution) => !activeIds.has(resolution.id))
      ) {
        throw new BindingResolutionError("当前绑定服务已经发生变化，请重新检查后再删除号码");
      }

      const activeBindingById = new Map(activeBindings.map((binding) => [binding.id, binding] as const));
      const now = new Date().toISOString();
      const bindingSummary: DeletedSimBindingSummary[] = [];
      let migratedBindings = 0;
      let deletedBindings = 0;

      for (const resolution of resolutions) {
        const currentBinding = activeBindingById.get(resolution.id);
        if (!currentBinding) throw new BindingResolutionError("绑定服务已经发生变化，请重新检查后再删除号码");

        if (resolution.action === "migrate") {
          const targetSimId = resolution.targetSimId as number;
          if (targetSimId === simId) throw new BindingResolutionError("绑定服务不能迁移到正在删除的号码");
          const target = db
            .select({
              id: simCards.id,
              label: simCards.label,
              phoneNumber: simCards.phoneNumber,
              carrierName: carriers.name,
            })
            .from(simCards)
            .innerJoin(carriers, eq(simCards.carrierId, carriers.id))
            .where(eq(simCards.id, targetSimId))
            .get();
          if (!target) throw new BindingResolutionError("迁移目标号码不存在，请重新选择");

          const updated = db
            .update(simBoundServices)
            .set({ simId: targetSimId, status: "active", updatedAt: now })
            .where(
              and(
                eq(simBoundServices.id, resolution.id),
                eq(simBoundServices.simId, simId),
                eq(simBoundServices.status, "active"),
              ),
            )
            .returning({ id: simBoundServices.id })
            .get();
          if (!updated) throw new BindingResolutionError("绑定服务已经发生变化，请重新检查后再删除号码");

          bindingSummary.push({
            serviceName: currentBinding.serviceName,
            action: "migrate",
            target: {
              label: target.label,
              phoneNumber: target.phoneNumber,
              carrierName: target.carrierName,
            },
          });
          migratedBindings += 1;
          continue;
        }

        const deletedBinding = db
          .delete(simBoundServices)
          .where(
            and(
              eq(simBoundServices.id, resolution.id),
              eq(simBoundServices.simId, simId),
              eq(simBoundServices.status, "active"),
            ),
          )
          .returning({ id: simBoundServices.id })
          .get();
        if (!deletedBinding) throw new BindingResolutionError("绑定服务已经发生变化，请重新检查后再删除号码");

        bindingSummary.push({ serviceName: currentBinding.serviceName, action: "delete" });
        deletedBindings += 1;
      }

      const remainingActive = getActiveBindings(simId);
      if (remainingActive.length) throw new BindingResolutionError("仍有绑定服务尚未处理，无法删除号码");

      let archiveId: number | null = null;
      if (preserveSnapshot) {
        const identityCountryCode = source.identityCountryCode?.trim().toUpperCase() || null;
        const identityCountry = identityCountryCode
          ? getCountryRegion(identityCountryCode)?.name ?? identityCountryCode
          : null;
        const identityDocumentType = source.identityDocumentType
          ? getIdentityDocumentTypeLabel(source.identityDocumentType, source.identityDocumentTypeCustom)
          : null;

        archiveId = createSimArchive({
          originalSimId: source.id,
          label: source.label,
          phoneNumber: source.phoneNumber,
          country: source.country,
          countryCode: source.countryCode,
          carrierName: source.carrierName,
          simType: source.simType,
          iccid: source.iccid,
          balance: source.balance,
          currencyCode: source.currencyCode,
          activationDate: source.activationDate,
          validUntil: source.validUntil,
          tariffPlanName: source.tariffPlanName,
          identityStatus: source.identityStatus,
          identityName: source.identityName,
          identityDocumentType,
          identityCountry,
          identityCountryCode,
          notes: source.notes,
          bindingSummary,
          deletedAt: now,
        });
      }

      const deletedSim = db.delete(simCards).where(eq(simCards.id, simId)).returning({ id: simCards.id }).get();
      if (!deletedSim) throw new Error("号码不存在");

      return { migratedBindings, deletedBindings, archived: preserveSnapshot, archiveId };
    })();

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BindingResolutionError) {
      return NextResponse.json({ error: error.message, requiresBindingResolution: true }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除号码失败" }, { status: 400 });
  }
}
