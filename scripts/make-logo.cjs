/**
 * Tách logo Thỏ (logo-tho.jpg của Thor: thỏ trắng trên nền tối) thành PNG TRONG SUỐT:
 *   public/logo-tho-light.png  — thỏ TRẮNG (đặt trên nền tối / bảng đen)
 *   public/logo-tho-dark.png   — thỏ GRAPHITE (đặt trên nền sáng)
 * Chạy lại: node scripts/make-logo.cjs   (cần sharp của Thor: ../Thor/node_modules/sharp)
 */
const path = require("path");
const fs = require("fs");
const sharp = require(path.resolve(__dirname, "..", "..", "Thor", "node_modules", "sharp"));

const SRC = path.resolve(__dirname, "..", "..", "Thor", "logo-tho.jpg");
const OUT = path.resolve(__dirname, "..", "public");

async function make(name, rgb) {
  const meta = await sharp(SRC).metadata();
  const top = 28; // bỏ dòng chữ mờ ở mép trên của ảnh gốc
  const { data, info } = await sharp(SRC)
    .extract({ left: 0, top, width: meta.width, height: meta.height - top })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i++) {
    const lum = data[i];
    const a = Math.max(0, Math.min(255, Math.round(((lum - 70) / (200 - 70)) * 255)));
    rgba[i * 4] = rgb[0];
    rgba[i * 4 + 1] = rgb[1];
    rgba[i * 4 + 2] = rgb[2];
    rgba[i * 4 + 3] = a;
  }
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim()
    .png()
    .toFile(path.join(OUT, name));
  console.log("ok", name);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await make("logo-tho-light.png", [255, 255, 255]);
  await make("logo-tho-dark.png", [28, 32, 52]);
})();
