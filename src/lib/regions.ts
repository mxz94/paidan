export type LuoyangRegionNode = {
  district: string;
  towns: string[];
};

export const LUOYANG_REGION_TREE: LuoyangRegionNode[] = [
  { district: "老城区", towns: ["西关街道", "道北街道", "邙山街道", "邙山镇"] },
  { district: "西工区", towns: ["王城路街道", "金谷园街道", "红山街道"] },
  { district: "瀍河回族区", towns: ["瀍西街道", "五股路街道", "白马寺镇"] },
  { district: "涧西区", towns: ["重庆路街道", "天津路街道", "工农街道", "孙旗屯乡"] },
  { district: "洛龙区", towns: ["安乐镇", "李楼镇", "关林街道", "学府街道"] },
  { district: "孟津区", towns: ["城关镇", "平乐镇", "会盟镇", "白鹤镇"] },
  { district: "偃师区", towns: ["城关街道", "顾县镇", "缑氏镇", "高龙镇"] },
  { district: "新安县", towns: ["城关镇", "磁涧镇", "石寺镇", "北冶镇"] },
  { district: "栾川县", towns: ["城关镇", "冷水镇", "潭头镇", "赤土店镇"] },
  { district: "嵩县", towns: ["城关镇", "田湖镇", "车村镇", "旧县镇"] },
  { district: "汝阳县", towns: ["城关镇", "小店镇", "蔡店乡", "上店镇"] },
  { district: "宜阳县", towns: ["城关镇", "柳泉镇", "韩城镇", "锦屏镇"] },
  { district: "洛宁县", towns: ["城关镇", "景阳镇", "赵村镇", "河底镇"] },
  { district: "伊川县", towns: ["城关街道", "鸦岭镇", "白沙镇", "鸣皋镇"] },
  { district: "伊滨区", towns: ["庞村镇", "李村镇", "寇店镇", "诸葛镇"] },
];

export const LUOYANG_REGIONS = LUOYANG_REGION_TREE.map((item) => item.district);

export function getLuoyangTowns(district: string) {
  return LUOYANG_REGION_TREE.find((item) => item.district === district)?.towns ?? [];
}

export function composeRegionValue(district: string, town: string) {
  const d = district.trim();
  const t = town.trim();
  if (!d) return "";
  return t ? `${d}-${t}` : d;
}

export function parseRegionValue(regionText: string) {
  const region = String(regionText || "").trim();
  if (!region) {
    return { district: "", town: "" };
  }

  const split = region.split(/[-/·\s]/).filter(Boolean);
  const first = split[0] ?? "";
  if (LUOYANG_REGIONS.includes(first)) {
    return { district: first, town: split.slice(1).join("") };
  }

  const district = LUOYANG_REGIONS.find((item) => region.includes(item)) ?? "";
  if (!district) {
    return { district: "", town: "" };
  }

  const towns = getLuoyangTowns(district);
  const town = towns.find((item) => region.includes(item)) ?? "";
  return { district, town };
}
