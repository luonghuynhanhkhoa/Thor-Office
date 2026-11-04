/**
 * Tạo icon của app (tab trình duyệt, thêm vào màn hình chính) từ logo Thỏ trắng tách nền (public/logo-tho-light.png,
 * tạo bởi scripts/make-logo.cjs) đặt trên nền graphite của app:
 *   app/icon.png (512, bo góc) · app/apple-icon.png (180, vuông — iOS tự bo) · app/favicon.ico (48, bo góc)
 * Chạy lại: node scripts/make-icons.cjs   (cần sharp của Thor: ../Thor/node_modules/sharp)
 */
const path = require("path");
const fs = require("fs");
const sharp = require(path.resolve(__dirname, "..", "..", "Thor", "node_modules", "sharp"));

const LOGO = path.resolve(__dirname, "..", "public", "logo-tho-light.png");
const APP = path.resolve(__dirname, "..", "app");
const BG = "#12162b";

async function make(size, rounded) {
  const inner = Math.round(size * 0.82);
  const logo = await sharp(LOGO).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: BG } }).composite([{ input: logo, gravity: "center" }]);
  if (rounded) {
    const r = Math.round(size * 0.22);
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
  }
  return img.png().toBuffer();
}

async function main() {
  fs.writeFileSync(path.join(APP, "icon.png"), await make(512, true));
  fs.writeFileSync(path.join(APP, "apple-icon.png"), await make(180, false));
  const png48 = await make(48, true);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(48, 6);
  header.writeUInt8(48, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png48.length, 14);
  header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(APP, "favicon.ico"), Buffer.concat([header, png48]));
  console.log("ok: icon.png, apple-icon.png, favicon.ico");
}
main();
