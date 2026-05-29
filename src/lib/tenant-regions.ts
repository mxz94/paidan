import { prisma } from "@/lib/prisma";
import { ensureTenantRegionCodeColumn } from "@/lib/db-ensure";
import {
  getDistricts,
  getRegionPreset,
  type RegionNode,
  type RegionPreset,
  type RegionPresetCode,
} from "@/lib/regions";

export type TenantRegionContext = {
  code: RegionPresetCode;
  label: string;
  tree: RegionNode[];
  districts: string[];
  amapCity: string;
  addressPrefix: string;
  cityName: string;
};

export function presetToContext(preset: RegionPreset): TenantRegionContext {
  return {
    code: preset.code,
    label: preset.label,
    tree: preset.tree,
    districts: getDistricts(preset.tree),
    amapCity: preset.amapCity,
    addressPrefix: preset.addressPrefix,
    cityName: preset.cityName,
  };
}

export async function getTenantRegionContext(tenantId: number): Promise<TenantRegionContext> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return presetToContext(getRegionPreset(null));
  }

  await ensureTenantRegionCodeColumn();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { regionCode: true },
  });

  return presetToContext(getRegionPreset(tenant?.regionCode));
}
