/* ==================================================================
   foto-pdf.html uçtan uca — tek dilde koşar: LANG_CODE=en node tests/foto-pdf.test.js
   (tests/run.js her dil için bir kez çalıştırır; verilmezse varsayılan dil.)
   Üretilen PDF pdf.js ile çizilip piksellerinden doğrulanır: köşe renkleri → yön
   (EXIF + döndürme), ortadaki ikili kod → sayfa sırası, gri alanın kutusu → sığdırma/ortalama.
     T1 yapı, dış istek yok      T2 seçme, sıra, atlanan dosyalar      T3 PDF: yön, sıra, sığdırma
     T4 seçenekler               T5 120 fotoğraf, iptal, alt çubuk      T6 30 × 12 MP
     T7 <img> yedeği             T8 sürükle-bırak                       T9 360px, dokunma, dört tema
     T10 metinler = i18n         T11 kütüphane yüklenemezse             T12 sağlamlık ayrıntıları
   Tek bölüm: node tests/foto-pdf.test.js T9
================================================================== */
"use strict";
const fs = require("fs"), path = require("path");
const { launch, reporter, ROOT, TMP, BASE_PATH, config, prefix, i18n, fill } = require("./harness.js");
const { ensureFixtures, files: dir, FX } = require("./fixtures.js");
const SHOTS = path.join(TMP, "shots");
const LANG = process.env.LANG_CODE || config.defaultLang;
const PAGE = prefix(LANG) + "foto-pdf.html";
const I18N = i18n(LANG);
const X = I18N["foto-pdf"];
const reEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// dilin sayı biçimi ("12,4" / "12.4", binlik ayırıcı) tarayıcıdaki gibi Intl'den
const PARTS = new Intl.NumberFormat(I18N.lang.locale).formatToParts(12345.6);
const GROUP = (PARTS.find(p => p.type === "group") || { value: "" }).value, DECIMAL = PARTS.find(p => p.type === "decimal").value;
const NUM = "\\d{1,3}(" + reEsc(GROUP) + "\\d{3})*(" + reEsc(DECIMAL) + "\\d)?";
const parseNum = t => parseFloat(t.split(GROUP).join("").replace(DECIMAL, "."));
const statRe = n => new RegExp("^" + reEsc(fill(X.done, { n, size: "§" })).replace("§", NUM + " (KB|MB)") + "$");
const readingRe = total => new RegExp("^" + reEsc(fill(X.reading, { done: "§", total })).replace("§", "\\d+") + "$");
const only = process.argv[2];
const { check, info, finish, crash } = reporter();
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Sayfaya yalnızca TEST sırasında enjekte edilir (dosyaya dokunmaz)
const INSPECT = `window.__inspect = async (url, scale) => {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "${BASE_PATH}lib/pdf.min.js"; s.onload = res; s.onerror = rej; document.head.append(s); });
    pdfjsLib.GlobalWorkerOptions.workerSrc = "${BASE_PATH}lib/pdf.worker.min.js";
  }
  const NAMED = { red:[220,30,30], green:[30,170,60], blue:[30,60,220], yellow:[240,210,40], gray:[200,200,200], white:[255,255,255], black:[0,0,0] };
  const nameOf = p => Object.entries(NAMED).map(([n, c]) => [n, (c[0]-p[0])**2 + (c[1]-p[1])**2 + (c[2]-p[2])**2]).sort((a, b) => a[1] - b[1])[0][0];
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await (await fetch(url)).arrayBuffer()) }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n), vp = page.getViewport({ scale });
    const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const W = cv.width, H = cv.height, d = ctx.getImageData(0, 0, W, H).data;
    const px = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return [d[i], d[i+1], d[i+2]]; };
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i] < 235 || d[i+1] < 235 || d[i+2] < 235) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, m = Math.min(bw, bh), s = m * .09, cell = m * .08, cx = x0 + bw / 2, cy = y0 + bh / 2;
    const bits = (dx, dy) => { let v = 0; for (let b = 0; b < 8; b++) { const p = px(cx + (b - 3.5) * cell * dx, cy + (b - 3.5) * cell * dy); v = v * 2 + ((p[0] + p[1] + p[2]) / 3 < 128 ? 1 : 0); } return v; };
    out.push({ w: +(vp.width / scale).toFixed(2), h: +(vp.height / scale).toFixed(2),
      box: [x0, y0, x1 + 1, y1 + 1].map(v => +(v / scale).toFixed(1)),
      corners: [px(x0 + s, y0 + s), px(x1 - s, y0 + s), px(x0 + s, y1 - s), px(x1 - s, y1 - s)].map(nameOf),
      mid: nameOf(px(cx, y0 + bh * .25)), bitsH: bits(1, 0), bitsV: bits(0, 1) });
  }
  return out;
};`;
// embedJpg'e verilen JPEG'lerin boyutları + aynı anda açık ImageBitmap sayısı + ilerleme yazıları
const SPY = `(() => {
  const sof = b => { for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xFF) { i++; continue; } const m = b[i+1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return [b[i+7] * 256 + b[i+8], b[i+5] * 256 + b[i+6]]; i += 2 + b[i+2] * 256 + b[i+3]; } return null; };
  window.__jpgs = [];
  const E = PDFLib.PDFDocument.prototype.embedJpg;
  PDFLib.PDFDocument.prototype.embedJpg = function (bytes) { const [w, h] = sof(bytes); window.__jpgs.push({ w, h, n: bytes.length }); return E.call(this, bytes); };
  let open = 0, max = 0, calls = 0; const C = window.createImageBitmap;
  window.createImageBitmap = async (...a) => { const bm = await C(...a); open++; calls++; max = Math.max(max, open); const close = bm.close.bind(bm); bm.close = () => { open--; close(); }; return bm; };
  window.__bmp = () => ({ open, max, calls });
  window.__prog = [];
  new MutationObserver(() => { const t = document.getElementById("progText").textContent; if (window.__prog[window.__prog.length - 1] !== t) window.__prog.push(t); }).observe(document.getElementById("progText"), { childList: true, characterData: true, subtree: true });
})()`;

(async () => {
  await ensureFixtures();
  const b = await launch();
  const { ev, go, reload, os, size, mobile, click, setFiles, waitUntil, sleep } = b;
  const idle = () => waitUntil(`document.getElementById("loadText").hidden && !document.getElementById("pick").disabled`);
  const done = () => waitUntil(`!document.getElementById("done").hidden || !document.getElementById("goMsg").hidden || (document.getElementById("work").hidden && !document.getElementById("idle").hidden && window.__started)`, 300000);
  const fresh = async (stored) => { await go(PAGE); await ev(`localStorage.clear()`); if (stored) await ev(`localStorage.setItem("noupload-theme", ${JSON.stringify(stored)})`); await reload(); };
  const pick = async files => { await setFiles("#file", files); await sleep(60); await idle(); };
  const make = async () => { await ev(`window.__started = true`); await click("#make"); await done(); };
  const names = () => ev(`[...document.querySelectorAll("#grid img")].map(i => i.alt)`);
  const radio = (name, value) => ev(`(() => { const r = document.querySelector('input[name="${name}"][value="${value}"]'); r.click(); })()`);
  const inspect = async (scale = 1) => { await ev(INSPECT); return ev(`__inspect(document.getElementById("dl").href, ${scale})`); };
  const section = id => !only || only === id;
  const A = dir("a"), ORDER_A = ["d_yatay.jpg", "c_dikey.jpg", "b_exif6.jpg", "a_saydam.png", "f_kucuk.jpg", "e_pano.jpg"];
  const CORN = ["red", "green", "blue", "yellow"];

  /* ---------- T1. Yapı + dış istek yok ---------- */
  if (section("T1")) {
    await os("light"); await size(1200); await fresh();
    const r = await ev(`(() => { const f = document.getElementById("file"); return { accept: f.accept, multiple: f.multiple, capture: f.hasAttribute("capture"), type: f.type,
      scripts: [...document.querySelectorAll("script[src]")].map(s => s.src), links: [...document.querySelectorAll('script[src], link[rel~="stylesheet"], link[rel~="icon"], link[rel~="preload"], img[src], iframe[src]')].map(n => n.src || n.href).filter(u => !u.startsWith("data:") && new URL(u).origin !== location.origin).length,
      title: document.title, h1: document.querySelector("h1").textContent, pickH: Math.round(document.getElementById("pick").getBoundingClientRect().height) }; })()`);
    check("T1 dosya girişi: image/*, multiple, capture yok", [r.accept, r.multiple, r.capture, r.type], ["image/*", true, false, "file"]);
    check("T1 betikler yerel: lib/pdf-lib.min.js (pdf.html ile aynı dosya) ve assets/site.js", r.scripts, [b.base + "/lib/pdf-lib.min.js", b.base + "/assets/site.js"]);
    check("T1 pdf.html de aynı yerel pdf-lib dosyasını kullanıyor", /<script src="lib\/pdf-lib\.min\.js">/.test(fs.readFileSync(path.join(ROOT, "pdf.html"), "utf8")), true);
    check("T1 sayfanın yüklediği hiçbir kaynak (betik/stil/ikon/img/iframe) başka siteden gelmiyor", r.links, 0);
    check("T1 başlık ve h1", [r.title, r.h1], [X.docTitle, X.title]);
    b.requests.length = 0;
    await reload(); await pick(A); await make();
    const ext = [...new Set(b.requests)].filter(u => !u.startsWith(b.base) && !u.startsWith("blob:") && !u.startsWith("data:"));
    check("T1 seç → oluştur boyunca HİÇ dış istek yok", ext, []);
    const posts = await ev(`performance.getEntriesByType("resource").map(e => e.name).filter(n => !n.startsWith(location.origin))`);
    check("T1 kaynak kayıtlarında başka istek yok", posts, []);
  }

  /* ---------- T2. Seçme, sıralama, atlanan dosyalar ---------- */
  if (section("T2")) {
    await os("light"); await size(1200); await fresh();
    check("T2 boş durumda liste / seçenekler / alt çubuk gizli", await ev(`["list","opts","goBar","warn"].map(i => document.getElementById(i).hidden)`), [true, true, true, true]);
    await pick(A);
    check("T2 sıra = lastModified artan (ad sırası değil)", await names(), ORDER_A);
    const r = await ev(`({ nums: [...document.querySelectorAll("#grid .no")].map(n => n.textContent), count: document.getElementById("count").textContent, warn: document.getElementById("warn").textContent, warnHidden: document.getElementById("warn").hidden,
      upFirst: document.querySelector('#grid li:first-child [data-act="up"]').disabled, downLast: document.querySelector('#grid li:last-child [data-act="down"]').disabled,
      acts: [...document.querySelectorAll("#grid li:first-child button")].map(x => x.dataset.act + ":" + x.querySelectorAll("svg").length + ":" + x.textContent.trim() + ":" + x.getAttribute("aria-label")), pick: document.getElementById("pick").textContent,
      vis: ["list","opts","goBar"].map(i => document.getElementById(i).hidden), hint: document.getElementById("qualHint").textContent,
      checked: [...document.querySelectorAll("input:checked")].map(i => i.value) })`);
    check("T2 numaralar, sayaç, düğmeler", [r.nums, r.count, r.acts, r.upFirst, r.downLast, r.pick, r.vis], [["1","2","3","4","5","6"], fill(X.nPhotos, { n: 6 }), ["up", "down", "rot", "del"].map(a => a + ":1::1: " + X[a]), true, true, X.pickMore, [false, false, false]]);
    check("T2 açılamayan dosyalar atlandı, kısa uyarı", [r.warnHidden, r.warn], [false, fill(X.skipped, { n: 2, names: "x_sahte.heic, y_notlar.txt" })]);
    check("T2 varsayılanlar: A4 + Dengeli, ipucu", [r.checked, r.hint], [["a4", "balanced"], fill(X.qualHint, { edge: 1800, q: 80 })]);

    // taşıma / döndürme / silme + odak
    await ev(`document.querySelector('#grid li:nth-child(1) [data-act="down"]').focus(); document.activeElement.click()`);
    check("T2 ↓: 1. kare 2. sıraya indi, odak aynı düğmede", [await names().then(n => n.slice(0, 2)), await ev(`document.activeElement === document.querySelector('#grid li:nth-child(2) [data-act="down"]')`)], [["c_dikey.jpg", "d_yatay.jpg"], true]);
    await ev(`document.querySelector('#grid li:nth-child(2) [data-act="up"]').focus(); document.activeElement.click()`);
    check("T2 ↑: geri çıktı; düğme basılamaz olunca odak ↓ düğmesine geçti", [await names().then(n => n.slice(0, 2)), await ev(`document.activeElement === document.querySelector('#grid li:nth-child(1) [data-act="down"]')`)], [["d_yatay.jpg", "c_dikey.jpg"], true]);
    await click('#grid li:nth-child(2) [data-act="rot"]');
    check("T2 ⟳: küçük resim 90° döndü", await ev(`document.querySelector("#grid li:nth-child(2) img").style.transform`), "rotate(90deg)");
    await ev(`document.querySelector('#grid li:nth-child(6) [data-act="del"]').focus(); document.activeElement.click()`);
    check("T2 ✕: kare çıktı, numaralar yenilendi, odak komşu karede", [await names(), await ev(`[...document.querySelectorAll("#grid .no")].map(n => n.textContent).join("")`), await ev(`document.activeElement === document.querySelector('#grid li:nth-child(5) [data-act="del"]')`), await ev(`document.getElementById("count").textContent`)], [ORDER_A.slice(0, 5), "12345", true, fill(X.nPhotos, { n: 5 })]);
    // ikinci seçim sona eklenir, elle yapılan sıra bozulmaz
    await click('#grid li:nth-child(1) [data-act="down"]');
    await pick([A[A.findIndex(f => f.endsWith("e_pano.jpg"))]]);
    check("T2 sonradan eklenen sona gelir, elle sıra korunur", await names(), ["c_dikey.jpg", "d_yatay.jpg", "b_exif6.jpg", "a_saydam.png", "f_kucuk.jpg", "e_pano.jpg"]);
    await click("#clear");
    check("T2 Temizle: her şey sıfırlandı", await ev(`[document.querySelectorAll("#grid li").length, document.getElementById("list").hidden, document.getElementById("warn").hidden, document.getElementById("pick").textContent]`), [0, true, true, X.pick]);
    await pick([A.find(f => f.endsWith("x_sahte.heic"))]);
    check("T2 yalnızca açılamayan dosya: uyarı var, liste yok, hata yok", await ev(`[document.getElementById("warn").textContent, document.getElementById("list").hidden, document.getElementById("goBar").hidden]`), [fill(X.skipped, { n: 1, names: "x_sahte.heic" }), true, true]);
  }

  /* ---------- T3. PDF: A4, Dengeli — yön, sıra, sığdırma, EXIF, döndürme ---------- */
  const expectBox = (pw, ph, iw, ih, margin) => { const k = Math.min((pw - 2 * margin) / iw, (ph - 2 * margin) / ih); const w = iw * k, h = ih * k; return [(pw - w) / 2, (ph - h) / 2, (pw + w) / 2, (ph + h) / 2]; };
  if (section("T3")) {
    await os("light"); await size(1200); await fresh(); await ev(SPY); await pick(A);
    await click('#grid li:nth-child(2) [data-act="rot"]');                      // c_dikey: 90° sağa → yatay olur
    for (let i = 0; i < 3; i++) await click('#grid li:nth-child(1) [data-act="rot"]');   // d_yatay: 270° → dikey olur
    await make();
    const r = await ev(`({ stat: document.getElementById("resStat").textContent, dl: document.getElementById("dl").getAttribute("download"), href: document.getElementById("dl").href.slice(0, 5), text: document.getElementById("dl").textContent,
      doneVisible: !document.getElementById("done").hidden, makeHidden: document.getElementById("idle").hidden, msgHidden: document.getElementById("goMsg").hidden, jpgs: window.__jpgs, bmp: window.__bmp(), prog: window.__prog })`);
    check("T3 bitince: sayfa sayısı + boyut, İndir, dosya adı", [r.doneVisible, r.makeHidden, r.dl, r.href, r.text, r.msgHidden], [true, true, X.fileName, "blob:", X.download, true]);
    check("T3 özet biçimi “6 sayfa · … KB/MB”", r.stat, s => statRe(6).test(s));
    const realSize = await ev(`fetch(document.getElementById("dl").href).then(r => r.blob()).then(x => x.size)`);
    check("T3 gösterilen boyut gerçek dosya boyutu", r.stat, s => { const m = s.match(/· (\S+) (KB|MB)$/); const v = parseNum(m[1]) * (m[2] === "MB" ? 1048576 : 1024); return Math.abs(v - realSize) <= (m[2] === "MB" ? 60000 : 1024); });
    check("T3 ilerleme “n / 6” sırayla", r.prog, ["1 / 6", "2 / 6", "3 / 6", "4 / 6", "5 / 6", "6 / 6"]);
    check("T3 aynı anda en çok 1 fotoğraf açık; hepsi kapatıldı", [r.bmp.max, r.bmp.open], [1, 0]);
    check("T3 gömülen JPEG ölçüleri (Dengeli: en uzun kenar ≤1800, küçük fotoğraf büyütülmedi)", r.jpgs.map(j => [j.w, j.h]), [[1200, 1600], [1600, 1200], [1200, 1600], [800, 800], [400, 300], [1800, 600]]);
    const pages = await inspect(1);
    const A4 = [595.28, 841.89], P = A4, L = [A4[1], A4[0]];
    check("T3 sayfa sayısı ve yönleri (fotoğrafa göre otomatik)", pages.map(p => [p.w, p.h]), [P, L, P, P, L, L]);
    const dims = [[1200, 1600], [1600, 1200], [1200, 1600], [800, 800], [400, 300], [1800, 600]];
    check("T3 her fotoğraf sayfaya sığdırılmış ve ortalanmış (18 pt kenar boşluğu)", pages.map((p, i) => { const e = expectBox(p.w, p.h, dims[i][0], dims[i][1], 18); return p.box.every((v, k) => near(v, e[k], 2)); }), [true, true, true, true, true, true]);
    check("T3 1. sayfa: 270° döndürülmüş yatay fotoğraf", pages[0].corners, ["green", "yellow", "red", "blue"]);
    check("T3 2. sayfa: 90° döndürülmüş dikey fotoğraf", pages[1].corners, ["blue", "red", "yellow", "green"]);
    check("T3 3. sayfa: EXIF yönü düzeltilmiş (köşeler görüntülenen yönde)", [pages[2].corners, pages[2].bitsH], [CORN, 3]);
    check("T3 4. sayfa: saydam PNG beyaz zeminde (siyah değil)", [pages[3].corners, pages[3].mid, pages[3].bitsH], [CORN, "white", 4]);
    check("T3 5–6. sayfa: küçük ve panoramik fotoğraf, sıra doğru", [pages[4].corners, pages[4].bitsH, pages[5].corners, pages[5].bitsH], [CORN, 5, CORN, 6]);
    // 90° sağa dönen şerit yukarıdan aşağı okunur (2); 270° dönen ters yönde durur: 00000001 → 10000000 = 128
    check("T3 döndürülenlerin sırası (dikey okunan kod)", [pages[1].bitsV, pages[0].bitsV], [2, 128]);
    await b.shot(path.join(SHOTS, "masaustu-bitti.png"));
  }

  /* ---------- T4. Seçenekler ---------- */
  if (section("T4")) {
    await os("light"); await size(1200); await fresh(); await ev(SPY); await pick(A);
    const sizes = {};
    for (const q of ["small", "balanced", "high"]) {
      await radio("quality", q);
      check(`T4 seçenek değişince eski sonuç geçersiz (${q})`, await ev(`[document.getElementById("done").hidden, document.getElementById("idle").hidden]`), [true, false]);
      await ev(`window.__jpgs.length = 0`); await make();
      const j = await ev(`window.__jpgs`);
      sizes[q] = await ev(`fetch(document.getElementById("dl").href).then(r => r.blob()).then(x => x.size)`);
      const edge = { small: 1200, balanced: 1800, high: 2600 }[q];
      check(`T4 ${q}: en uzun kenar ≤ ${edge}; ondan büyük fotoğraflar tam ${edge}'e indi (1600'lükler yalnızca Küçük'te)`, [Math.max(...j.map(x => Math.max(x.w, x.h))), j.filter(x => Math.max(x.w, x.h) === edge).length], [edge, q === "small" ? 4 : 1]);
    }
    check("T4 dosya boyutu: Küçük < Dengeli < Yüksek", sizes, s => s.small < s.balanced && s.balanced < s.high);
    check("T4 kalite ipuçları", await ev(`["small","balanced","high"].map(v => { document.querySelector('input[name="quality"][value="' + v + '"]').click(); return document.getElementById("qualHint").textContent; })`), [[1200, 70], [1800, 80], [2600, 90]].map(([edge, q]) => fill(X.qualHint, { edge, q })));
    await radio("quality", "balanced"); await radio("size", "letter"); await make();
    let pages = await inspect(1);
    check("T4 Letter: 612×792, yön otomatik", pages.map(p => [p.w, p.h]), [[792, 612], [612, 792], [612, 792], [612, 792], [792, 612], [792, 612]]);
    await radio("size", "photo"); await make();
    pages = await inspect(1);
    const dims = [[1600, 1200], [1200, 1600], [1200, 1600], [800, 800], [400, 300], [3000, 1000]];
    check("T4 Fotoğraf boyutu: sayfa oranı = fotoğraf oranı, boşluk yok", pages.map((p, i) => near(p.w / p.h, dims[i][0] / dims[i][1], .01) && Math.max(p.w, p.h) > 841 && Math.max(p.w, p.h) < 843), [true, true, true, true, true, true]);
    check("T4 Fotoğraf boyutu: görüntü sayfayı kaplıyor", pages.filter((p, i) => i !== 3).map(p => near(p.box[0], 0, 1.5) && near(p.box[1], 0, 1.5) && near(p.box[2], p.w, 1.5) && near(p.box[3], p.h, 1.5)), [true, true, true, true, true]);
  }

  /* ---------- T5. 120 fotoğraf: sıra, tek tek işleme, ilerleme, iptal, alt çubuk ---------- */
  if (section("T5")) {
    await os("light"); await mobile(360, 640); await fresh(); await ev(SPY);
    const B = dir("b");
    await setFiles("#file", B); await sleep(30);
    const mid = await ev(`document.getElementById("loadText").textContent`);
    await idle();
    check("T5 okuma sırasında ilerleme yazısı", mid, s => readingRe(120).test(s));
    const n = await names();
    check("T5 120 fotoğraf çekim sırasında (ad sırası tam tersi)", [n.length, n[0], n[119]], [120, "IMG_0999.jpg", "IMG_0880.jpg"]);
    check("T5 küçük resim okurken de aynı anda en çok 1 fotoğraf açık", await ev(`[__bmp().max, __bmp().open, __bmp().calls]`), [1, 0, 120]);
    const st = await ev(`(() => { scrollTo(0, 0); const g = document.getElementById("goBar").getBoundingClientRect(), m = document.getElementById("make").getBoundingClientRect(); return { stuck: Math.round(g.bottom) === innerHeight, makeVisible: m.top >= 0 && m.bottom <= innerHeight, cols: getComputedStyle(document.getElementById("grid")).gridTemplateColumns.split(" ").length, docH: document.documentElement.scrollHeight }; })()`);
    check("T5 360×640: alt çubuk ekranın altına yapışık, “PDF oluştur” görünür, ızgara 2 sütun", [st.stuck, st.makeVisible, st.cols], [true, true, 2]);
    await b.shot(path.join(SHOTS, "telefon-120-liste.png"));
    // iptal
    await b.send("Emulation.setCPUThrottlingRate", { rate: 8 });
    await ev(`window.__started = true; document.getElementById("make").click()`);
    await sleep(650);
    await waitUntil(`/^([2-9]|[1-9][0-9]) \\/ 120$/.test(document.getElementById("progText").textContent)`);
    const during = await ev(`({ pick: document.getElementById("pick").disabled, clear: document.getElementById("clear").disabled, tile: document.querySelector('#grid [data-act="del"]').disabled, radios: document.getElementById("setSize").disabled, work: !document.getElementById("work").hidden })`);
    await b.shot(path.join(SHOTS, "telefon-120-ilerleme.png"));
    await click("#cancel");
    await waitUntil(`document.getElementById("work").hidden`);
    await b.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    check("T5 üretim sırasında liste ve seçenekler kilitli", during, { pick: true, clear: true, tile: true, radios: true, work: true });
    check("T5 İptal: başa döner, sonuç yok, kilitler açılır", await ev(`[document.getElementById("idle").hidden, document.getElementById("done").hidden, document.getElementById("pick").disabled, document.querySelector('#grid [data-act="del"]').disabled, __bmp().open]`), [false, true, false, false, 0]);
    // tam üretim
    await ev(`window.__prog.length = 0; window.__jpgs.length = 0`);
    const t0 = Date.now(); await make(); const ms = Date.now() - t0;
    const r = await ev(`({ stat: document.getElementById("resStat").textContent, prog: window.__prog, bmp: __bmp(), jpgs: window.__jpgs.length })`);
    check("T5 120 sayfa üretildi", [r.stat.startsWith(fill(X.done, { n: 120, size: "" })), r.jpgs], [true, 120]);
    check("T5 ilerleme 1 / 120 … 120 / 120, hiç atlamadan", [r.prog.length, r.prog[0], r.prog[11], r.prog[119]], [120, "1 / 120", "12 / 120", "120 / 120"]);
    check("T5 üretimde aynı anda en çok 1 fotoğraf açık", [r.bmp.max, r.bmp.open], [1, 0]);
    const pages = await inspect(.5);
    check("T5 PDF'teki sayfa sırası = çekim sırası (1…120)", pages.map(p => p.bitsH), Array.from({ length: 120 }, (_, i) => i + 1));
    info(`T5 120 küçük fotoğraf: ${ms} ms`);
    await ev(`scrollTo(0, 0)`); await b.shot(path.join(SHOTS, "telefon-120-bitti.png"));
  }

  /* ---------- T6. 12 MP × 30: bellek düzeni ve süre ---------- */
  if (section("T6")) {
    await os("light"); await mobile(360, 640); await fresh(); await ev(SPY);
    const t0 = Date.now(); await setFiles("#file", dir("c")); await sleep(60); await waitUntil(`document.getElementById("loadText").hidden`, 300000); const tRead = Date.now() - t0;
    const heap0 = await ev(`performance.memory ? performance.memory.usedJSHeapSize : 0`);
    const t1 = Date.now(); await make(); const tMake = Date.now() - t1;
    const r = await ev(`({ stat: document.getElementById("resStat").textContent, bmp: __bmp(), edges: window.__jpgs.map(j => Math.max(j.w, j.h)), canvas: [...document.querySelectorAll("canvas")].length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 })`);
    check("T6 30 × 12 MP: tamamlandı, tek tek işlendi", [r.stat.startsWith(fill(X.done, { n: 30, size: "" })), r.bmp.max, r.bmp.open, [...new Set(r.edges)]], [true, 1, 0, [1800]]);
    info(`T6 30 × 12 MP — okuma ${tRead} ms, PDF ${tMake} ms, ${r.stat}, JS yığını ${(heap0 / 1048576).toFixed(0)} → ${(r.heap / 1048576).toFixed(0)} MB`);
  }

  /* ---------- T7. createImageBitmap seçeneği tanımayan tarayıcı (eski Safari) ---------- */
  if (section("T7")) {
    await os("light"); await size(1200); await fresh();
    await ev(`window.createImageBitmap = () => Promise.reject(new TypeError("imageOrientation: from-image desteklenmiyor"))`);
    await pick(A); await make();
    const pages = await inspect(1);
    check("T7 <img> yedeği: 6 fotoğraf da açıldı, EXIF yönü yine doğru", [await names(), pages.length, pages[2].corners, [pages[2].w, pages[2].h]], [ORDER_A, 6, CORN, [595.28, 841.89]]);
    check("T7 yedek yolda da açılamayanlar atlanıyor", await ev(`document.getElementById("warn").textContent`), fill(X.skipped, { n: 2, names: "x_sahte.heic, y_notlar.txt" }));
  }

  /* ---------- T8. Sürükle-bırak (masaüstü) ---------- */
  if (section("T8")) {
    await os("light"); await size(1200); await fresh();
    const r = await ev(`(async () => {
      const mk = async (name, t) => { const c = document.createElement("canvas"); c.width = 300; c.height = 200; c.getContext("2d").fillRect(0, 0, 300, 200); const bl = await new Promise(r => c.toBlob(r, "image/jpeg")); return new File([bl], name, { type: "image/jpeg", lastModified: t }); };
      const dt = new DataTransfer(); dt.items.add(await mk("sonra.jpg", 2000)); dt.items.add(await mk("once.jpg", 1000));
      const fire = (type, target) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire("dragenter", document.body); const over = document.getElementById("drop").classList.contains("over");
      const notCancelled = fire("dragover", document.body);
      fire("drop", document.querySelector("footer"));
      return { over, prevented: !notCancelled, after: document.getElementById("drop").classList.contains("over") };
    })()`);
    await idle();
    check("T8 sayfanın herhangi bir yerine bırakılan fotoğraflar alınır, tarihe göre dizilir", [r, await names()], [{ over: true, prevented: true, after: false }, ["once.jpg", "sonra.jpg"]]);
    check("T8 sürükleme ipucu masaüstünde görünür", await ev(`getComputedStyle(document.querySelector(".drophint")).display`), "block");
    await mobile(360, 740); await b.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); await reload();
    check("T8 dokunmatik cihazda (hover yok, kaba işaretçi) sürükleme ipucu gizli", await ev(`getComputedStyle(document.querySelector(".drophint")).display`), "none");
    await b.send("Emulation.setTouchEmulationEnabled", { enabled: false }); await size(1200);
  }

  /* ---------- T9. 360px: taşma yok, dokunma hedefleri, dört tema durumu, iki dil ---------- */
  if (section("T9")) {
    const STATES = [["light", null], ["dark", null], ["light", "dark"], ["dark", "light"]];
    for (const [sys, stored] of STATES) {
      await os(sys); await mobile(360, 740); await fresh(stored);
      const dark = (stored || sys) === "dark", tag = `T9 [sistem=${sys}, kayıt=${stored}]`;
      const over = () => ev(`(() => { const cw = document.documentElement.clientWidth; const bad = [...document.querySelectorAll("body *")].filter(n => { const q = n.getBoundingClientRect(); return q.width && (q.right > cw + .5 || q.left < -.5); }).map(n => n.tagName + "#" + n.id + "." + n.className); return [document.documentElement.scrollWidth > cw, bad.slice(0, 5)]; })()`);
      check(`${tag} boş durumda taşma yok, zemin ${dark ? "koyu" : "açık"}`, [await over(), await ev(`getComputedStyle(document.documentElement).getPropertyValue("--ground").trim().toUpperCase()`)], [[false, []], dark ? "#101A21" : "#EEF1F3"]);
      await pick(A);
      check(`${tag} liste + seçenekler: taşma yok`, await over(), [false, []]);
      const t = await ev(`(() => { const r = s => [...document.querySelectorAll(s)].map(n => n.getBoundingClientRect()); const min = (a, k) => Math.round(Math.min(...a.map(q => q[k])) * 10) / 10;
        return { tileBtnW: min(r("#grid button"), "width"), tileBtnH: min(r("#grid button"), "height"), seg: min(r(".seg label"), "height"), pick: min(r("#pick"), "height"), make: min(r("#make"), "height"), clear: min(r("#clear"), "height"), cols: getComputedStyle(document.getElementById("grid")).gridTemplateColumns.split(" ").length }; })()`);
      check(`${tag} dokunma hedefleri ≥ 40px, ızgara 2 sütun`, [t.tileBtnW >= 40, t.tileBtnH >= 40, t.seg >= 40, t.pick >= 40, t.make >= 40, t.clear >= 40, t.cols], [true, true, true, true, true, true, 2]);
      const c = await ev(`(() => { const v = n => { const i = document.createElement("i"); i.style.color = "var(" + n + ")"; document.body.append(i); const x = getComputedStyle(i).color; i.remove(); return x; }; const cs = (s, p) => getComputedStyle(document.querySelector(s))[p];
        return [cs(".ph", "backgroundColor") === v("--surface"), cs(".no", "backgroundColor") === v("--accent"), cs(".no", "color") === v("--accent-ink"), cs(".seg input:checked + span", "backgroundColor") === v("--accent"), cs("#goBar", "backgroundColor") === v("--ground"), cs("#make", "color") === v("--accent-ink"), cs("#opts", "backgroundColor") === v("--surface")]; })()`);
      check(`${tag} yeni öğelerin renkleri temayı izliyor`, c, [true, true, true, true, true, true, true]);
      await make();
      check(`${tag} sonuç durumunda taşma yok, İndir ≥ 40px`, [await over(), await ev(`Math.round(document.getElementById("dl").getBoundingClientRect().height) >= 40`)], [[false, []], true]);
      await b.fullShot(path.join(SHOTS, `telefon-360-${sys}-${stored || "sistem"}.png`), 360);
      await mobile(360, 740);
    }
    for (const w of [320, 340, 375, 393, 412, 480, 600, 768]) {
      await os("light"); await mobile(w, 740); await fresh(); await pick(A); await make();
      const r = await ev(`(() => { const cw = document.documentElement.clientWidth; return [document.documentElement.scrollWidth > cw, Math.min(...[...document.querySelectorAll("#grid button")].map(n => n.getBoundingClientRect().width)) >= 40]; })()`);
      check(`T9 ${w}px: taşma yok, kare düğmeleri ≥ 40px`, r, [false, true]);
    }
  }

  /* ---------- T10. Metinler: sayfa kendi dilinde, i18n dosyasıyla birebir ---------- */
  if (section("T10")) {
    await os("light"); await size(1200); await fresh(); await pick(A); await make();
    const { tools, ...commonFlat } = I18N.common;
    const r = await ev(`({ lang: document.documentElement.lang, str: STR, dataT: document.querySelectorAll("[data-t]").length, oldBtn: !!document.getElementById("lang"),
      seg: [...document.querySelectorAll(".seg label span")].map(x => x.textContent), legends: [...document.querySelectorAll(".seg legend")].map(x => x.textContent), hints: [document.querySelector("#list .hint").textContent, document.querySelector("#setSize .hint").textContent, document.getElementById("bigHint").textContent],
      btns: ["clear", "cancel", "dl"].map(i => document.getElementById(i).textContent), head: [document.querySelector("h1").textContent, document.querySelector("header p").textContent, document.querySelector(".privacy span:last-child").textContent, document.querySelector(".drophint").textContent, document.querySelector("footer").textContent],
      grid: document.getElementById("grid").getAttribute("aria-label"), aria: document.querySelector('#grid li:nth-child(3) [data-act="rot"]').getAttribute("aria-label"), dl: document.getElementById("dl").getAttribute("download") })`);
    check("T10 sayfanın dili ve STR = i18n dosyasındaki ortak + sayfa metinleri", [r.lang, r.str, r.dataT, r.oldBtn], [LANG, { ...commonFlat, ...X, locale: I18N.lang.locale }, 0, false]);
    check("T10 sabit metinler", [r.seg, r.legends, r.hints, r.btns, r.head, r.grid, r.aria, r.dl], [[X.sizeA4, X.sizeLetter, X.sizePhoto, X.qSmall, X.qBalanced, X.qHigh], [X.sizeL, X.qualL], [X.orderHint, X.sizeHint, X.bigHint], [X.clear, X.cancel, X.download], [X.title, X.sub, X.privacy, X.dropHint, X.foot], X.gridLabel, "3: " + X.rot, X.fileName]);
  }

  /* ---------- T11. pdf-lib yüklenemezse ---------- */
  if (section("T11")) {
    await os("light"); await size(1200);
    const before = b.problems.length;
    await b.send("Network.setBlockedURLs", { urls: ["*pdf-lib*"] });
    await fresh();
    check("T11 pdf-lib engelliyken sayfa yine açılıyor ve kullanılabiliyor", await ev(`[typeof window.PDFLib, document.querySelector("h1").textContent, document.getElementById("pick").disabled, document.getElementById("pdflib").defer]`), ["undefined", X.title, false, true]);
    await pick(A.slice(0, 3));
    await ev(`window.__started = true; document.getElementById("make").focus()`); await click("#make");
    await waitUntil(`!document.getElementById("goMsg").hidden`);
    check("T11 yüklenemezse: anlaşılır hata, liste duruyor, sayfa kilitlenmiyor, odak düğmede", await ev(`[document.getElementById("goMsg").textContent, document.querySelectorAll("#grid li").length, document.getElementById("idle").hidden, document.getElementById("pick").disabled, document.activeElement.id]`), [X.noLib, 3, false, false, "make"]);
    await b.send("Network.setBlockedURLs", { urls: [] });
    await make();
    check("T11 bağlantı gelince sayfayı yenilemeden PDF oluşuyor", await ev(`[document.getElementById("resStat").textContent.startsWith(${JSON.stringify(fill(X.done, { n: 3, size: "" }))}), document.getElementById("goMsg").hidden]`), [true, true]);
    b.problems.splice(before);                                   // engellenen isteğin konsol kaydı beklenen bir şey
  }

  /* ---------- T12. Gözden geçirmede çıkanlar ---------- */
  if (section("T12")) {
    const lum = c => { const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    const ratio = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    // okuma sürerken alt çubuk nedenini söylüyor
    await os("light"); await mobile(360, 640); await fresh();
    await b.send("Emulation.setCPUThrottlingRate", { rate: 8 });
    await setFiles("#file", dir("b")); await sleep(250);
    const rd = await ev(`[document.getElementById("make").disabled, document.getElementById("make").textContent, document.getElementById("goBar").hidden]`);
    await b.send("Emulation.setCPUThrottlingRate", { rate: 1 }); await idle();
    check("T12 okuma sürerken alt çubuktaki düğme nedenini yazıyor", [rd[0], readingRe(120).test(rd[1]), rd[2], await ev(`document.getElementById("make").textContent`)], [true, true, false, X.make]);
    check("T12 ipucu metni sıra değişse de doğru kalıyor", await ev(`document.querySelector("#list .hint").textContent`), X.orderHint);

    // klavye odağı yapışkan çubuğun altında kalmıyor
    for (const [w, h, files] of [[1366, 650, A], [360, 640, dir("b").slice(0, 12)]]) {
      if (w > 600) await size(w, h); else await mobile(w, h);
      await fresh(); await pick(files);
      const hidden = await ev(`(() => { const bar = document.getElementById("goBar"); const out = [];
        for (const n of document.querySelectorAll("#list button, #opts input, #clear")) { if (n.disabled) continue; n.focus(); const q = n.getBoundingClientRect(), t = bar.getBoundingClientRect().top; if (q.bottom > t + 1 && q.top < innerHeight) out.push((n.id || n.dataset.act || n.value) + "@" + Math.round(q.bottom) + ">" + Math.round(t)); }
        return out; })()`);
      check(`T12 ${w}×${h}: odaklanan hiçbir düğme alt çubuğun arkasında kalmıyor`, hidden.slice(0, 4), []);
    }

    // odak yönetimi + çift basışa karşı koruma + kaydederken iptal
    await os("light"); await size(1200); await fresh(); await ev(SPY); await pick(A);
    await ev(`window.__started = true; document.getElementById("make").focus(); document.getElementById("make").click(); document.getElementById("cancel").click()`);
    const atStart = await ev(`document.activeElement.id`);
    await done();
    check("T12 başlayınca odak İptal'e geçer; hemen ardından gelen ikinci basış işi iptal etmez; bitince odak İndir'de", [atStart, await ev(`!document.getElementById("done").hidden`), await ev(`document.activeElement.id`), await ev(`document.getElementById("dl").getAttribute("aria-describedby")`)], ["cancel", true, "dl", "resStat"]);
    await radio("quality", "small");
    await ev(`(() => { const S = PDFLib.PDFDocument.prototype.save; PDFLib.PDFDocument.prototype.save = async function (...a) { window.__saving = true; await new Promise(r => setTimeout(r, 900)); return S.apply(this, a); }; })()`);
    await ev(`window.__saving = false; document.getElementById("make").click()`);
    await waitUntil(`window.__saving`); await sleep(550); await click("#cancel");   // ilk yarım saniyedeki basış bilerek sayılmıyor
    await waitUntil(`document.getElementById("work").hidden`);
    check("T12 kaydetme sürerken basılan İptal de geçerli: sonuç çıkmıyor, odak “PDF oluştur”da", await ev(`[document.getElementById("done").hidden, document.getElementById("idle").hidden, pdfUrl, document.activeElement.id]`), [true, false, null, "make"]);

    // hepsi atlanan bir ekleme hazır PDF'i silmiyor; uyarı metni gereksiz yere yeniden yazılmıyor
    await fresh(); await pick(A);
    await ev(`window.__warnWrites = 0; new MutationObserver(m => { window.__warnWrites += m.length; }).observe(document.getElementById("warn"), { childList: true, characterData: true, subtree: true })`);
    await make();
    check("T12 üretim boyunca uyarı metni yeniden yazılmadı (ekran okuyucu tekrar okumaz)", await ev(`window.__warnWrites`), 0);
    const href = await ev(`document.getElementById("dl").href`);
    await pick([A.find(f => f.endsWith("x_sahte.heic"))]);
    check("T12 yalnızca açılamayan dosya eklenince hazır PDF geçerli kalıyor", await ev(`[!document.getElementById("done").hidden, document.getElementById("dl").href === ${JSON.stringify(href)}, document.getElementById("warn").textContent]`), [true, true, fill(X.skipped, { n: 1, names: "x_sahte.heic" })]);
    await pick([A.find(f => f.endsWith("f_kucuk.jpg"))]);
    check("T12 gerçekten fotoğraf eklenince eski PDF geçersiz oluyor", await ev(`[document.getElementById("done").hidden, document.getElementById("idle").hidden, document.querySelectorAll("#grid li").length]`), [true, false, 7]);
    check("T12 bekleme zamanlayıcıya bağlı değil (arka planda yavaşlamaz)", await ev(`[/MessageChannel/.test(tick.toString()), /setTimeout/.test(tick.toString())]`), [true, false]);

    // okunaklılık: sayaç, ipucu, ilerleme yazısı ≥ 4.5:1 (açık ve koyu)
    for (const stored of ["light", "dark"]) {
      await os("light"); await mobile(360, 740); await fresh(stored); await pick(A);
      const c = await ev(`(() => { const bg = getComputedStyle(document.body).backgroundColor, card = getComputedStyle(document.getElementById("opts")).backgroundColor; const col = s => getComputedStyle(document.querySelector(s)).color;
        return { count: [col("#count"), bg], orderHint: [col("#list .hint"), bg], qualHint: [col("#qualHint"), card], prog: [col("#progText"), bg], stat: [col("#resStat"), bg], load: [col("#loadText"), getComputedStyle(document.getElementById("drop")).backgroundColor] }; })()`);
      check(`T12 [${stored}] küçük yazıların kontrastı ≥ 4.5:1`, Object.entries(c).filter(([k, v]) => ratio(v[0], v[1]) < 4.5).map(([k, v]) => k + " " + ratio(v[0], v[1]).toFixed(2)), []);
    }
    // Windows kontrast teması
    await b.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: "dark" }] });
    await size(1200); await fresh(); await pick(A);
    const fc = await ev(`(() => { const cs = (s, p) => getComputedStyle(document.querySelector(s))[p]; return { forced: matchMedia("(forced-colors: active)").matches,
      checked: [cs(".seg input:checked + span", "outlineStyle"), cs(".seg input:checked + span", "outlineWidth")], unchecked: cs(".seg input:not(:checked) + span", "outlineStyle"),
      tile: cs(".ph", "outlineStyle"), fillVsTrack: cs(".fill", "backgroundColor") !== cs(".track", "backgroundColor"), track: cs(".track", "borderTopStyle") }; })()`);
    check("T12 kontrast temasında seçili seçenek, kare sınırı ve ilerleme çubuğu ayırt ediliyor", fc, { forced: true, checked: ["solid", "3px"], unchecked: "none", tile: "solid", fillVsTrack: true, track: "solid" });
    await os("light");

    // uzun hata mesajı çubuğu şişirmiyor
    await mobile(360, 640); await fresh(); await pick(A);
    await ev(`(() => { const long = "COK_UZUN_DOSYA_ADI_".repeat(12) + ".jpg"; result = { pages: 3, size: 1000, failed: [long, long, long, long] }; pdfUrl = "blob:x"; paint(); })()`);
    check("T12 360×640: hata mesajı olsa da alt çubuk ekranın üçte birini geçmiyor, taşma yok", await ev(`[document.getElementById("goBar").getBoundingClientRect().height / innerHeight < .34, document.documentElement.scrollWidth > document.documentElement.clientWidth]`), [true, false]);
  }

  await finish(b);
})().catch(crash);
