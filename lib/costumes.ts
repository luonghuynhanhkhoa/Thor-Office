/** Danh mục trang phục để mỗi người tự chọn cho nhân vật của mình (an toàn cho trình duyệt). */
export type CostumeId =
  | "default"
  | "witch"
  | "pumpkin"
  | "vampire"
  | "gown"
  | "bikini"
  | "hero"
  | "cat"
  | "bear"
  | "bunny"
  | "cowboy"
  | "chef";

export const COSTUMES: { id: CostumeId; emoji: string; name: string; group: string }[] = [
  { id: "default", emoji: "🙂", name: "Mặc định", group: "Thường" },
  { id: "witch", emoji: "🧙‍♀️", name: "Phù thủy", group: "Halloween" },
  { id: "pumpkin", emoji: "🎃", name: "Bí ngô", group: "Halloween" },
  { id: "vampire", emoji: "🧛", name: "Ma cà rồng", group: "Halloween" },
  { id: "gown", emoji: "👗", name: "Đầm dạ hội", group: "Dạ tiệc" },
  { id: "bikini", emoji: "👙", name: "Áo tắm bikini", group: "Đi biển" },
  { id: "hero", emoji: "🦸", name: "Siêu anh hùng", group: "Siêu anh hùng" },
  { id: "cat", emoji: "🐱", name: "Đồ thú · Mèo", group: "Đồ thú" },
  { id: "bear", emoji: "🐻", name: "Đồ thú · Gấu", group: "Đồ thú" },
  { id: "bunny", emoji: "🐰", name: "Đồ thú · Thỏ", group: "Đồ thú" },
  { id: "cowboy", emoji: "🤠", name: "Cao bồi", group: "Nghề nghiệp" },
  { id: "chef", emoji: "👨‍🍳", name: "Đầu bếp", group: "Nghề nghiệp" },
];

export const COSTUME_IDS = new Set<string>(COSTUMES.map((c) => c.id));
export const asCostume = (v: unknown): CostumeId => (typeof v === "string" && COSTUME_IDS.has(v) ? (v as CostumeId) : "default");
