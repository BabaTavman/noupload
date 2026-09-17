/* ==================================================================
   Test örnekleri — tests/.tmp/fixtures altında ÜRETİLİR, depoya girmez.
     node tests/fixtures.js          yoksa üretir
     node tests/fixtures.js --fresh  baştan üretir

   Fotoğraflar tarayıcıda tuvale çizilip kaydedilir. Her görüntünün
   (GÖRÜNTÜLENEN yönünde) köşeleri:  sol-üst KIRMIZI, sağ-üst YEŞİL,
   sol-alt MAVİ, sağ-alt SARI.  Ortada 8 hücrelik şerit, sıra numarasının
   ikili yazımıdır (siyah=1, beyaz=0, en anlamlı bit solda). Testler üretilen
   PDF'i çizip bu renklerden yönü, şeritten sayfa sırasını okur.
   Dosya adlarının sırası çekim (mtime) sırasından bilerek farklıdır.

     a/    d_yatay.jpg 1600×1200 · c_dikey.jpg 1200×1600 · b_exif6.jpg (EXIF yönü 6; 1200×1600 görünür)
           a_saydam.png 800×800 saydam · f_kucuk.jpg 400×300 · e_pano.jpg 3000×1000
           x_sahte.heic (çöp baytlar) · y_notlar.txt          — mtime bu sırayla artar
     b/    120 numaralı 640×480 JPEG; ad sırası çekim sırasının tersi
     c/    30 adet 12 MP JPEG (3 farklı görüntü, 10'ar kopya)
     pdf/  A-uc-sayfa.pdf (200×300, 210×310, 220×320) · B-iki-sayfa.pdf (400×200, 410×210)
           tek.pdf (1 sayfa) · bozuk.pdf (PDF değil)
================================================================== */
"use strict";
const fs = require("fs"), path = require("path");
const { launch, FX } = require("./harness.js");
const VERSION = "1";
const T0 = new Date("2026-01-15T10:00:00Z").getTime();

// EXIF Orientation etiketi taşıyan en küçük APP1 bölümü
function exifApp1(orientation) {
  const tiff = Buffer.alloc(26);
  tiff.write("II", 0, "ascii"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);                                   // 1 kayıt
  tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12);  // Orientation, SHORT
  tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(orientation, 18); tiff.writeUInt16LE(0, 20);
  tiff.writeUInt32LE(0, 22);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const head = Buffer.alloc(4); head.writeUInt16BE(0xFFE1, 0); head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}
const withExif = (jpeg, o) => Buffer.concat([jpeg.subarray(0, 2), exifApp1(o), jpeg.subarray(2)]);

const DRAW = `(w, h, index, o) => {
  o = o || {};
  const D = document.createElement("canvas"); D.width = w; D.height = h;
  const c = D.getContext("2d");
  if (!o.alpha) { c.fillStyle = "rgb(200,200,200)"; c.fillRect(0, 0, w, h); }
  if (o.busy) {                                   // gerçek fotoğraf gibi sıkıştırılması zor olsun
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#c8c8c8"); g.addColorStop(.5, "#d8d0c0"); g.addColorStop(1, "#c0c8d8");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { c.fillStyle = "rgba(" + (i * 37 % 255) + "," + (i * 91 % 255) + "," + (i * 53 % 255) + ",.25)"; c.fillRect((i * 7919) % w, (i * 104729) % h, 40, 6); }
  }
  const s = Math.round(Math.min(w, h) * .18);
  [["rgb(220,30,30)", 0, 0], ["rgb(30,170,60)", w - s, 0], ["rgb(30,60,220)", 0, h - s], ["rgb(240,210,40)", w - s, h - s]].forEach(([col, x, y]) => { c.fillStyle = col; c.fillRect(x, y, s, s); });
  const cell = Math.round(Math.min(w, h) * .08), x0 = Math.round(w / 2 - 4 * cell), y0 = Math.round(h / 2 - cell / 2);
  for (let b = 0; b < 8; b++) { c.fillStyle = (index >> (7 - b)) & 1 ? "#000" : "#fff"; c.fillRect(x0 + b * cell, y0, cell, cell); }
  c.fillStyle = "#333"; c.font = "bold " + Math.round(cell * 1.4) + "px sans-serif"; c.textAlign = "center"; c.fillText(String(index), w / 2, y0 - cell * .6);
  let out = D;
  if (o.storeRotatedCCW) {                        // EXIF 6 için: saklanan pikseller görüntünün 90° sola dönmüş hâli
    out = document.createElement("canvas"); out.width = h; out.height = w;
    const k = out.getContext("2d"); k.translate(0, out.height); k.rotate(-Math.PI / 2); k.drawImage(D, 0, 0);
  }
  return out.toDataURL(o.alpha ? "image/png" : "image/jpeg", o.q || .9).split(",")[1];
}`;

async function ensureFixtures({ fresh = false } = {}) {
  const stamp = path.join(FX, ".surum");
  if (!fresh && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === VERSION) return FX;
  fs.rmSync(FX, { recursive: true, force: true });
  for (const d of ["a", "b", "c", "pdf"]) fs.mkdirSync(path.join(FX, d), { recursive: true });
  const b = await launch();
  try {
    await b.go("pdf.html");                                   // pdf-lib bu sayfada yüklü; tuval her sayfada var
    const make = async (w, h, index, o) => Buffer.from(await b.ev(`(${DRAW})(${w}, ${h}, ${index}, ${JSON.stringify(o || {})})`), "base64");
    const save = (dir, name, buf, minute) => { const p = path.join(FX, dir, name); fs.writeFileSync(p, buf); const t = new Date(T0 + minute * 60000); fs.utimesSync(p, t, t); };

    save("a", "d_yatay.jpg",  await make(1600, 1200, 1), 1);
    save("a", "c_dikey.jpg",  await make(1200, 1600, 2), 2);
    save("a", "b_exif6.jpg",  withExif(await make(1200, 1600, 3, { storeRotatedCCW: true }), 6), 3);
    save("a", "a_saydam.png", await make(800, 800, 4, { alpha: true }), 4);
    save("a", "f_kucuk.jpg",  await make(400, 300, 5), 5);
    save("a", "e_pano.jpg",   await make(3000, 1000, 6), 6);
    save("a", "x_sahte.heic", Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 131 + 7) % 256)), 7);
    save("a", "y_notlar.txt", Buffer.from("bu bir fotoğraf değil"), 8);

    for (let i = 1; i <= 120; i++) save("b", `IMG_${String(1000 - i).padStart(4, "0")}.jpg`, await make(640, 480, i, { q: .8 }), i);

    const big = [await make(4032, 3024, 1, { busy: true }), await make(3024, 4032, 2, { busy: true }), await make(4032, 3024, 3, { busy: true })];
    for (let i = 1; i <= 30; i++) save("c", `BUYUK_${String(i).padStart(2, "0")}.jpg`, big[(i - 1) % 3], i);

    const pdf = async (name, sizes) => {
      const b64 = await b.ev(`(async () => { const d = await PDFLib.PDFDocument.create(); for (const [w, h] of ${JSON.stringify(sizes)}) { const p = d.addPage([w, h]); p.drawRectangle({ x: 20, y: 20, width: w - 40, height: h / 2, color: PDFLib.rgb(.1, .4, .6) }); } return d.saveAsBase64(); })()`);
      fs.writeFileSync(path.join(FX, "pdf", name), Buffer.from(b64, "base64"));
    };
    await pdf("A-uc-sayfa.pdf", [[200, 300], [210, 310], [220, 320]]);
    await pdf("B-iki-sayfa.pdf", [[400, 200], [410, 210]]);
    await pdf("tek.pdf", [[200, 200]]);
    fs.writeFileSync(path.join(FX, "pdf", "bozuk.pdf"), "bu bir pdf değil");
  } finally { await b.close(); }
  fs.writeFileSync(stamp, VERSION);
  return FX;
}

const files = dir => fs.readdirSync(path.join(FX, dir)).filter(f => !f.startsWith(".")).map(f => path.join(FX, dir, f));
module.exports = { ensureFixtures, files, FX };

if (require.main === module) {
  ensureFixtures({ fresh: process.argv.includes("--fresh") })
    .then(dir => { console.log("örnekler hazır: " + dir); setTimeout(() => process.exit(0), 200); })
    .catch(e => { console.error("HATA:", e); process.exit(2); });
}
