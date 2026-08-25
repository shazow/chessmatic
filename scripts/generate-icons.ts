// Regenerate public/ icons from art/icon-original.png.
//
// Usage: npm run icons
//
// Regular icons and the favicon keep the source's transparent background.
// Maskable PWA icons must be opaque and full-bleed, so they get the theme
// background with the artwork scaled into the safe zone.
import sharp from "sharp";

const SOURCE = "art/icon-original.png";
const OUT_DIR = "public";

// Matches background_color in vite.config.ts's PWA manifest.
const MASKABLE_BG = "#1a2d24";
// Maskable safe zone: artwork should fit within the central 80% circle.
const MASKABLE_SCALE = 0.72;

async function transparentIcon(size: number, name: string) {
  await sharp(SOURCE)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(`${OUT_DIR}/${name}`);
  console.log(`${name}: ${size}x${size} transparent`);
}

async function maskableIcon(size: number, name: string) {
  const inner = Math.round(size * MASKABLE_SCALE);
  const artwork = await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: MASKABLE_BG },
  })
    .composite([{ input: artwork, gravity: "centre" }])
    .png()
    .toFile(`${OUT_DIR}/${name}`);
  console.log(`${name}: ${size}x${size} on ${MASKABLE_BG}`);
}

await transparentIcon(64, "favicon.png");
await transparentIcon(192, "icon-192.png");
await transparentIcon(512, "icon-512.png");
await maskableIcon(192, "icon-maskable-192.png");
await maskableIcon(512, "icon-maskable-512.png");
