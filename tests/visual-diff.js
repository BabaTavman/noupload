/* ==================================================================
   Görsel karşılaştırma — çalışma kopyasındaki sayfaları bir git sürümündekilerle
   piksel piksel karşılaştırır. "Bu değişiklik görünümü bozdu mu?" sorusu için.

     node tests/visual-diff.js            son commit (HEAD) ile
     node tests/visual-diff.js v1.0       başka bir sürüm/commit/dal ile

   Her dil × sayfa × (açık, koyu) × (1200px masaüstü, 360px telefon) için tam sayfa görüntüsü
   alınır. Fark varsa tests/.tmp/visual/ altına üç dosya yazılır: …-eski, …-yeni, …-fark
   (farklı pikseller kırmızı). Fark çıkması hata olmayabilir: görünümü bilerek
   değiştirdiysen beklenen budur. `npm test` bunu çalıştırmaz.
================================================================== */
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { launch, ROOT, TMP, config, rel, sleep } = require("./harness.js");
const REF = process.argv[2] || "HEAD";
const OUT = path.join(TMP, "visual"), OLD = path.join(TMP, "visual-ref");
const TOLERANCE = 6;                     // kanal başına bu kadar fark yok sayılır (kenar yumuşatma)

const git = (...args) => execFileSync("git", args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 });

(async () => {
  // karşılaştırılacak sürümün dosyalarını geçici klasöre çıkar
  fs.rmSync(OUT, { recursive: true, force: true }); fs.rmSync(OLD, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const names = git("ls-tree", "-r", "--name-only", "-z", REF).toString("utf8").split("\0").filter(Boolean);
  for (const name of names) { const f = path.join(OLD, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, git("show", `${REF}:${name}`)); }

  const b = await launch({ extraMounts: [["/__ref/", OLD]] }); const { ev } = b;
  const shoot = async (url, stored, mobile) => {
    const metrics = height => b.send("Emulation.setDeviceMetricsOverride", { width: mobile ? 360 : 1200, height, deviceScaleFactor: 1, mobile });
    await metrics(800); await b.navigate(url);
    await ev(`localStorage.clear(); localStorage.setItem("noupload-theme", "${stored}")`); await b.reload();
    await ev(`document.activeElement && document.activeElement.blur()`);
    await metrics(Math.min(await ev("document.documentElement.scrollHeight"), 5000)); await sleep(120);
    return (await b.send("Page.captureScreenshot", { format: "png" })).data;
  };
  const rows = []; let differing = 0;
  await b.os("light");
  for (const l of config.langs) for (const p of config.pages) {
    const page = rel(l, p), refFile = path.join(OLD, page || "index.html", page.endsWith("/") ? "index.html" : "");
    if (!fs.existsSync(refFile)) { rows.push(`YOK   ${(page || "(ana sayfa)").padEnd(22)} ${REF} sürümünde bu sayfa yok`); continue; }
    for (const stored of ["light", "dark"]) for (const mobile of [false, true]) {
      const tag = `${l}-${p}-${stored === "light" ? "acik" : "koyu"}-${mobile ? 360 : 1200}`;
      const A = await shoot(b.origin + "/__ref/" + page, stored, mobile), B = await shoot(b.base + "/" + page, stored, mobile);
      await b.navigate("about:blank");
      const r = await ev(`(async () => {
        const load = d => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + d; });
        const [a, n] = await Promise.all([load(${JSON.stringify(A)}), load(${JSON.stringify(B)})]);
        const W = Math.max(a.width, n.width), H = Math.max(a.height, n.height);
        const px = im => { const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.fillStyle = "#f0f"; x.fillRect(0, 0, W, H); x.drawImage(im, 0, 0); return x.getImageData(0, 0, W, H); };
        const pa = px(a), pn = px(n), out = document.createElement("canvas"); out.width = W; out.height = H; const ox = out.getContext("2d"); ox.drawImage(n, 0, 0); ox.fillStyle = "rgba(255,0,0,.55)";
        let diff = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const d = Math.max(Math.abs(pa.data[i] - pn.data[i]), Math.abs(pa.data[i+1] - pn.data[i+1]), Math.abs(pa.data[i+2] - pn.data[i+2]));
          if (d > ${TOLERANCE}) { diff++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; ox.fillRect(x, y, 1, 1); } }
        return { a: [a.width, a.height], n: [n.width, n.height], diff, box: diff ? [x0, y0, x1, y1] : null, png: diff ? out.toDataURL("image/png").split(",")[1] : null };
      })()`);
      if (r.diff) {
        differing++;
        for (const [suffix, data] of [["eski", A], ["yeni", B], ["fark", r.png]]) fs.writeFileSync(path.join(OUT, `${tag}-${suffix}.png`), Buffer.from(data, "base64"));
      }
      rows.push(`${r.diff ? "FARK " : "AYNI "} ${tag.padEnd(30)} ${REF}: ${r.a.join("×")}  şimdi: ${r.n.join("×")}  farklı piksel: ${String(r.diff).padStart(7)}${r.box ? "  kutu " + r.box.join(",") : ""}`);
    }
  }
  console.log(rows.join("\n"));
  console.log(`\n${REF} ile karşılaştırma: ${rows.filter(r => r.startsWith("AYNI")).length} aynı, ${differing} farklı` + (differing ? ` — görüntüler: ${path.relative(ROOT, OUT)}` : ""));
  await b.close(); fs.rmSync(OLD, { recursive: true, force: true });
  setTimeout(() => process.exit(differing ? 1 : 0), 200);
})().catch(e => { console.error("HATA:", e); process.exit(2); });
