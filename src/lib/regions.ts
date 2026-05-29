export type RegionNode = {
  district: string;
  towns: string[];
};

export type RegionPresetCode = "luoyang" | "anyang";

export type RegionPreset = {
  code: RegionPresetCode;
  label: string;
  amapCity: string;
  addressPrefix: string;
  cityName: string;
  tree: RegionNode[];
};

export const DEFAULT_REGION_PRESET_CODE: RegionPresetCode = "luoyang";

export const LUOYANG_REGION_TREE: RegionNode[] = [
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

export const ANYANG_REGION_TREE: RegionNode[] = [
  { district: "文峰区", towns: ["东大街街道", "西大街街道", "南门街道", "北大街街道", "光华路街道", "永明路街道", "中华路街道", "高庄镇"] },
  { district: "北关区", towns: ["红旗路街道", "豆腐营街道", "洹北街道", "曙光路街道", "民航路街道", "彰北街道", "柏庄镇"] },
  { district: "殷都区", towns: ["梅园庄街道", "李珍街道", "电厂路街道", "铁西路街道", "水冶街道", "清风街街道", "曲沟镇"] },
  { district: "龙安区", towns: ["田村街道", "彰武街道", "文明大道街道", "中州路街道", "东风乡"] },
  { district: "安阳县", towns: ["城关镇", "水冶镇", "铜冶镇", "善应镇", "吕村镇", "伦掌镇", "崔家桥镇", "韩陵镇", "永和镇"] },
  { district: "汤阴县", towns: ["城关镇", "宜沟镇", "白营镇", "伏道镇", "韩庄镇", "古贤镇"] },
  { district: "滑县", towns: ["道口镇街道", "城关镇", "白道口镇", "留固镇", "上官镇", "牛屯镇", "万古镇", "高平镇"] },
  { district: "内黄县", towns: ["城关镇", "井店镇", "梁庄镇", "后河镇", "楚旺镇", "二安镇"] },
  { district: "林州市", towns: ["开元街道", "振林街道", "龙山街道", "桂园街道", "合涧镇", "临淇镇", "东姚镇", "横水镇"] },
];

export const REGION_PRESETS: Record<RegionPresetCode, RegionPreset> = {
  luoyang: {
    code: "luoyang",
    label: "洛阳",
    amapCity: "洛阳",
    addressPrefix: "河南省洛阳市",
    cityName: "洛阳市",
    tree: LUOYANG_REGION_TREE,
  },
  anyang: {
    code: "anyang",
    label: "安阳",
    amapCity: "安阳",
    addressPrefix: "河南省安阳市",
    cityName: "安阳市",
    tree: ANYANG_REGION_TREE,
  },
};

export type LuoyangRegionNode = RegionNode;

export const LUOYANG_REGIONS = LUOYANG_REGION_TREE.map((item) => item.district);

export function isRegionPresetCode(value: string | null | undefined): value is RegionPresetCode {
  return value === "luoyang" || value === "anyang";
}

export function getRegionPreset(code: string | null | undefined): RegionPreset {
  if (isRegionPresetCode(code)) {
    return REGION_PRESETS[code];
  }
  return REGION_PRESETS[DEFAULT_REGION_PRESET_CODE];
}

export function listRegionPresetOptions() {
  return (Object.keys(REGION_PRESETS) as RegionPresetCode[]).map((code) => ({
    code,
    label: REGION_PRESETS[code].label,
  }));
}

export function getDistricts(tree: RegionNode[]) {
  return tree.map((item) => item.district);
}

export function getTowns(tree: RegionNode[], district: string) {
  return tree.find((item) => item.district === district)?.towns ?? [];
}

/** @deprecated 使用 getTowns(tree, district) */
export function getLuoyangTowns(district: string) {
  return getTowns(LUOYANG_REGION_TREE, district);
}

export function composeRegionValue(district: string, town: string) {
  const d = district.trim();
  const t = town.trim();
  if (!d) return "";
  return t ? `${d}-${t}` : d;
}

export function parseRegionValue(regionText: string, tree: RegionNode[] = LUOYANG_REGION_TREE) {
  const region = String(regionText || "").trim();
  if (!region) {
    return { district: "", town: "" };
  }

  const districts = getDistricts(tree);
  const split = region.split(/[-/·\s]/).filter(Boolean);
  const first = split[0] ?? "";
  if (districts.includes(first)) {
    return { district: first, town: split.slice(1).join("") };
  }

  const district = districts.find((item) => region.includes(item)) ?? "";
  if (!district) {
    return { district: "", town: "" };
  }

  const towns = getTowns(tree, district);
  const town = towns.find((item) => region.includes(item)) ?? "";
  return { district, town };
}

function buildRegionAliasPairs(tree: RegionNode[]) {
  const pairs: Array<[string, string]> = [];
  for (const item of tree) {
    const district = item.district;
    pairs.push([district, district]);
    if (district.endsWith("区")) {
      pairs.push([district.slice(0, -1), district]);
    } else if (district.endsWith("县")) {
      pairs.push([district.slice(0, -1), district]);
    } else if (district.endsWith("市")) {
      pairs.push([district.slice(0, -1), district]);
    }
  }
  return pairs;
}

export function detectRegionByAddress(address: string, tree: RegionNode[] = LUOYANG_REGION_TREE) {
  const text = address.trim();
  if (!text) return "";
  const keywords = getDistricts(tree).sort((a, b) => b.length - a.length);
  const found = keywords.find((item) => text.includes(item));
  return found ?? "";
}

export function buildAddressCandidates(address: string, preset: Pick<RegionPreset, "addressPrefix" | "cityName" | "tree">) {
  const raw = String(address || "").trim();
  const compact = raw.replace(/\s+/g, "").replace(/[，,。；;、]/g, "");
  const set = new Set<string>();
  const { addressPrefix, cityName, tree } = preset;

  if (raw) set.add(raw);
  if (compact) set.add(compact);
  if (compact && cityName && !compact.startsWith(cityName)) set.add(`${cityName}${compact}`);
  if (compact && addressPrefix && !compact.startsWith(addressPrefix)) set.add(`${addressPrefix}${compact}`);

  for (const [alias, full] of buildRegionAliasPairs(tree)) {
    if (compact.includes(alias) && !compact.includes(full)) {
      const replaced = compact.replace(alias, full);
      set.add(replaced);
      if (cityName) set.add(`${cityName}${replaced}`);
      if (addressPrefix) set.add(`${addressPrefix}${replaced}`);
    }
  }

  if (compact.includes("城关") && !compact.includes("城关镇")) {
    const withTown = compact.replace("城关", "城关镇");
    set.add(withTown);
    if (cityName) set.add(`${cityName}${withTown}`);
    if (addressPrefix) set.add(`${addressPrefix}${withTown}`);
  }

  return Array.from(set).filter(Boolean);
}
