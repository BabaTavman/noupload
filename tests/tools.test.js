/* ==================================================================
   Araçların işlevi — her dilde:
     P  pdf.html: birleştirme, sayfa seçme/döndürme, mesajlar, dosya adları (üretilen PDF açılıp bakılır)
     F  foto.html: küçültme, hedef tutmazsa uyarı, EXIF yönü, açılamayan dosya
     O  çevrimdışı: sayfa açıldıktan sonra bağlantı kesilir, üç araç da çalışır
   Bütün koşu boyunca site dışına tek istek çıkmamalı.
   Tek bölüm: node tests/tools.test.js F
================================================================== */
"use strict";
const fs = require("fs"), path = require("path");
const { launch, reporter, CONTRAST_AUDIT, config, prefix, i18n, fill, FX } = require("./harness.js");
const { ensureFixtures } = require("./fixtures.js");
const LANGS = config.langs;
const I18N = Object.fromEntries(LANGS.map(l => [l, i18n(l)]));
const only = process.argv[2], section = id => !only || only === id;
const { check, finish, crash } = reporter();
// indirmeyi yakala: <a download>.click() dosyayı kaydetmek yerine kayda geçer; blob silinmez ki içine bakılabilsin
const HOOK = `(() => { window.__dl = []; const C = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute("download")) { window.__dl.push({ name: this.download, href: this.href }); return; } return C.call(this); }; URL.revokeObjectURL = () => {}; })()`;
const PDFINFO = `(async href => { const d = await PDFLib.PDFDocument.load(await (await fetch(href)).arrayBuffer()); return d.getPages().map(p => [Math.round(p.getWidth()), Math.round(p.getHeight()), p.getRotation().angle]); })`;

(async () => {
  await ensureFixtures();
  const b = await launch(); const { ev, go, reload, os, size, mobile, click, setFiles, waitUntil, sleep } = b;
  await os("light"); await size(1200);
  // araç kullanılırken görünen metinler (mesaj, sayaç, liste, sonuç) de kontrast denetiminden geçer; iki tema yerinde denenir (renk geçişi yok)
  const audit = async name => { for (const th of ["light", "dark"]) { await ev(`document.documentElement.setAttribute("data-theme", "${th}")`); check(`${name} [${th}] · metin kontrastı`, await ev(CONTRAST_AUDIT), []); } await ev(`document.documentElement.removeAttribute("data-theme")`); };
  const A = path.join(FX, "pdf", "A-uc-sayfa.pdf"), B = path.join(FX, "pdf", "B-iki-sayfa.pdf"), BAD = path.join(FX, "pdf", "bozuk.pdf");

  /* ---------- P. pdf.html ---------- */
  if (section("P")) for (const l of LANGS) {
    const S = I18N[l].pdf, page = prefix(l) + "pdf.html", tag = `P ${page}`;
    await go(page); await ev(`localStorage.clear()`); await reload(); await ev(HOOK);
    check(`${tag} · sabit metinler ve başlık`, await ev(`[document.documentElement.lang, document.title, document.querySelector("h1").textContent, document.querySelector("header p").textContent, document.getElementById("tabMerge").textContent, document.getElementById("tabPages").textContent, document.querySelector("#dropM strong").textContent, document.getElementById("mergeGo").textContent, document.querySelector("footer").textContent, document.getElementById("cardM").hidden, document.getElementById("countM").textContent]`),
      [l, S.docTitle, S.title, S.sub, S.tabMerge, S.tabPages, S.dropM1, S.mergeGo, S.foot, true, ""]);
    check(`${tag} · kütüphaneler yerel; pdf.js worker belleğe alınmış`, await ev(`(async () => { for (let i = 0; i < 100 && !pdfjsLib.GlobalWorkerOptions.workerSrc.startsWith("blob:"); i++) await new Promise(r => setTimeout(r, 50)); return [[...document.querySelectorAll("script[src]")].map(s => s.getAttribute("src")), pdfjsLib.GlobalWorkerOptions.workerSrc.slice(0, 5), typeof PDFLib.PDFDocument]; })()`),
      [[prefix(l) ? "../lib/pdf-lib.min.js" : "lib/pdf-lib.min.js", prefix(l) ? "../lib/pdf.min.js" : "lib/pdf.min.js", prefix(l) ? "../assets/site.js" : "assets/site.js"], "blob:", "function"]);
    // birleştirme
    await setFiles("#fileM", [A]); await waitUntil(`document.querySelectorAll("#listM li").length === 1`);
    check(`${tag} · tek dosya: sayaç (tekil) ve "en az iki dosya" uyarısı`, [await ev(`document.getElementById("countM").textContent`), await ev(`(document.getElementById("mergeGo").click(), document.getElementById("msgM").textContent)`)], [fill(S.nFiles.one, { n: 1 }), S.needTwo]);
    await setFiles("#fileM", [B]); await waitUntil(`document.querySelectorAll("#listM li").length === 2`);
    check(`${tag} · iki dosya: sayaç (çoğul), düğme adları`, await ev(`[document.getElementById("countM").textContent, [...document.querySelectorAll("#listM li:first-child button")].map(x => x.getAttribute("aria-label") + (x.disabled ? "-" : "+")), document.querySelector("#listM .nm").textContent.includes("A-uc-sayfa.pdf")]`), [fill(S.nFiles.other, { n: 2 }), [S.up + "-", S.down + "+", S.del + "+"], true]);
    await click("#mergeGo"); await waitUntil(`document.getElementById("msgM").className.includes("ok")`);
    let d = await ev(`window.__dl.at(-1)`);
    check(`${tag} · birleştir: mesaj, dosya adı, sayfalar A sonra B`, [await ev(`document.getElementById("msgM").textContent`), d.name, await ev(`${PDFINFO}(${JSON.stringify(d.href)})`)], [fill(S.merged, { n: 2 }), S.mergedName, [[200, 300, 0], [210, 310, 0], [220, 320, 0], [400, 200, 0], [410, 210, 0]]]);
    await audit(`${tag} · birleştirildi`);
    { // dokunmatik telefon: sıra düğmeleri parmağa göre (≥ 40px), dosya adına yer kalıyor, taşma yok
      await mobile(360, 800); await b.touch(true);
      check(`${tag} · dokunmatik 360px: ↑ ↓ ✕ en az 40px, dosya adı sığıyor, taşma yok`, await ev(`(() => { const q = [...document.querySelectorAll("#listM .mini button")].map(x => x.getBoundingClientRect()); const nm = document.querySelector("#listM .nm");
        return [Math.min(...q.map(r => Math.min(r.width, r.height))) >= 40, nm.scrollWidth <= nm.clientWidth, document.documentElement.scrollWidth > document.documentElement.clientWidth]; })()`), [true, true, false]);
      await b.touch(false); await size(1200); }
    await click("#listM li:first-child [data-down]"); await click("#mergeGo"); await waitUntil(`window.__dl.length === 2`);
    d = await ev(`window.__dl.at(-1)`);
    check(`${tag} · ↓ ile sıra değişince B sonra A`, (await ev(`${PDFINFO}(${JSON.stringify(d.href)})`)).map(p => p[0]), [400, 410, 200, 210, 220]);
    await click("#mergeClear");
    check(`${tag} · Temizle`, await ev(`[document.getElementById("cardM").hidden, document.querySelectorAll("#listM li").length]`), [true, 0]);
    // sayfa seçme
    await click("#tabPages");
    await setFiles("#fileP", [A]); await waitUntil(`document.querySelectorAll("#gridP .pg canvas").length === 3`, 20000);
    check(`${tag} · sayfa seç: 3 küçük resim çizildi (pdf.js), sayaç`, await ev(`(() => { const cs = [...document.querySelectorAll("#gridP canvas")]; const painted = cs.map(c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 200) return true; return false; }); return [painted, document.getElementById("countP").textContent, document.getElementById("paneMerge").hidden]; })()`), [[true, true, true], fill(S.nPages, { sel: 3, total: 3, n: 3 }), true]);
    await click("#gridP .pg:nth-child(2)");
    { // Windows kontrast teması: dolgu renkleri silinir; seçili sekme ve seçili sayfa kenarlık kalınlığıyla ayrılmalı
      await b.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: "light" }] });
      const bw = s => `parseFloat(getComputedStyle(document.querySelector('${s}')).borderTopWidth)`;
      check(`${tag} · kontrast temasında seçili sekme ve seçili sayfa kalın kenarlıkla ayrılıyor`, await ev(`[${bw('.tab[aria-selected="true"]')} - ${bw('.tab[aria-selected="false"]')} >= 2, ${bw("#gridP .pg.sel")} - ${bw("#gridP .pg:not(.sel)")} >= 2]`), [true, true]);
      await os("light"); }
    check(`${tag} · sayfaya tıklayınca seçim kalkar`, await ev(`[document.getElementById("countP").textContent, document.querySelector("#gridP .pg:nth-child(2)").classList.contains("sel")]`), [fill(S.nPages, { sel: 2, total: 3, n: 3 }), false]);
    await audit(`${tag} · sayfa seç`);
    await click("#rot"); await click("#pagesGo"); await waitUntil(`document.getElementById("msgP").className.includes("ok")`);
    d = await ev(`window.__dl.at(-1)`);
    check(`${tag} · seçilenlerden PDF: 1. ve 3. sayfa, 90° dönmüş; mesaj ve dosya adı`, [await ev(`${PDFINFO}(${JSON.stringify(d.href)})`), await ev(`document.getElementById("msgP").textContent`), d.name], [[[200, 300, 90], [220, 320, 90]], fill(S.made, { n: 2 }), S.pagesName]);
    await click("#selInv"); check(`${tag} · tersini seç`, await ev(`document.getElementById("countP").textContent`), fill(S.nPages, { sel: 1, total: 3, n: 3 }));
    await click("#selAll"); check(`${tag} · tümünü seç`, await ev(`document.getElementById("countP").textContent`), fill(S.nPages, { sel: 3, total: 3, n: 3 }));
    await click("#selNone"); await click("#pagesGo");
    check(`${tag} · hiç sayfa seçili değilken uyarı`, await ev(`[document.getElementById("countP").textContent, document.getElementById("msgP").textContent]`), [fill(S.nPages, { sel: 0, total: 3, n: 3 }), S.pickOne]);
    await setFiles("#fileP", [BAD]); await waitUntil(`document.getElementById("msgP").textContent === ${JSON.stringify(S.bad)}`);
    check(`${tag} · bozuk dosyada anlaşılır hata`, await ev(`document.getElementById("msgP").className`), "msg err");
    await audit(`${tag} · bozuk dosya`);
    // ilk seçilen dosya bozuksa da mesaj görünmeli (mesaj, o ana dek gizli duran kartın içinde)
    await reload(); await ev(HOOK); await click("#tabPages"); await setFiles("#fileP", [BAD]); await waitUntil(`document.getElementById("msgP").textContent === ${JSON.stringify(S.bad)}`);
    check(`${tag} · ilk dosya bozuksa hata ekranda görünüyor`, await ev(`(() => { const q = document.getElementById("msgP").getBoundingClientRect(); return q.width > 0 && q.height > 0; })()`), true);
  }

  /* ---------- F. foto.html ---------- */
  if (section("F")) for (const l of LANGS) {
    const S = I18N[l].foto, page = prefix(l) + "foto.html", tag = `F ${page}`;
    await go(page); await ev(`localStorage.clear()`); await reload(); await ev(HOOK);
    check(`${tag} · sabit metinler`, await ev(`[document.documentElement.lang, document.title, document.querySelector("h1").textContent, document.querySelector("header p").textContent, document.querySelector(".localnote").textContent, document.getElementById("drop").getAttribute("aria-label"), document.querySelector("#drop strong").textContent, document.querySelector("#drop span").textContent,
      [...document.querySelectorAll("label")].map(x => x.textContent), document.querySelector(".hint").textContent, document.getElementById("go").textContent, document.getElementById("reset").textContent, [...document.querySelectorAll(".pane h3")].map(x => x.textContent), [document.getElementById("imgBefore").alt, document.getElementById("imgAfter").alt], document.getElementById("download").textContent, document.querySelector("footer").textContent]`),
      [l, S.docTitle, S.title, S.sub, I18N[l].common.localNote, S.dropLabel, S.drop1, S.drop2, [S.maxW, S.maxH, S.target], S.hint, S.go, S.reset, [S.before, S.after], [S.altBefore, S.altAfter], S.download, S.foot]);
    check(`${tag} · varsayılanlar 600 × 800 px, 150 KB`, await ev(`["maxW","maxH","target"].map(i => document.getElementById(i).value)`), ["600", "800", "150"]);
    await setFiles("#file", [path.join(FX, "c", "BUYUK_01.jpg")]); await waitUntil(`document.getElementById("statBefore").textContent.includes("px")`);
    check(`${tag} · seçince önceki boyut ve ölçü`, await ev(`[/^\\d+ KB4032×3024 px$/.test(document.getElementById("statBefore").textContent), document.getElementById("controls").hidden, document.getElementById("result").hidden]`), [true, false, true]);
    await click("#go"); await waitUntil(`!document.getElementById("result").hidden && document.getElementById("go").textContent === ${JSON.stringify(S.go)}`, 60000);
    let r = await ev(`(() => { const t = document.getElementById("statAfter").textContent, m = t.match(/^(\\d+) KB(\\d+)×(\\d+) px$/); return { kb: +m[1], w: +m[2], h: +m[3], cls: document.getElementById("verdict").className, text: document.getElementById("verdict").textContent }; })()`);
    const saved = await ev(`(async () => { const f = document.getElementById("file").files[0]; const blob = await (await fetch(document.getElementById("imgAfter").src)).blob(); const bm = await createImageBitmap(blob); return { saved: Math.round((1 - blob.size / f.size) * 100), type: blob.type, w: bm.width, h: bm.height, size: blob.size }; })()`);
    check(`${tag} · küçült: kutuya sığdı, hedefin altında, sonuç JPEG`, [r.w, r.h, r.kb <= 150, saved.type, saved.w, saved.h, saved.size <= 150 * 1024, r.cls], [600, 450, true, "image/jpeg", 600, 450, true, "verdict ok"]);
    check(`${tag} · sonuç cümlesi`, r.text, fill(S.ok, { kb: r.kb, saved: saved.saved }));
    await audit(`${tag} · sonuç (tamam)`);
    await click("#download");
    check(`${tag} · indirilen dosyanın adı`, await ev(`window.__dl.at(-1).name`), "BUYUK_01" + S.suffix + ".jpg");
    await ev(`(document.getElementById("target").value = 5, document.getElementById("maxW").value = 4000, document.getElementById("maxH").value = 4000)`);
    await click("#go"); await waitUntil(`document.getElementById("verdict").className === "verdict miss"`, 60000);
    r = await ev(`({ text: document.getElementById("verdict").textContent, kb: +document.getElementById("statAfter").textContent.match(/^(\\d+) KB/)[1] })`);
    check(`${tag} · hedef tutmayınca uyarı cümlesi`, r.text, fill(S.miss, { kb: r.kb, target: 5 }));
    await audit(`${tag} · sonuç (hedef tutmadı)`);
    await click("#reset"); check(`${tag} · "${S.reset}"`, await ev(`[document.getElementById("controls").hidden, document.getElementById("result").hidden]`), [true, true]);
    await setFiles("#file", [path.join(FX, "a", "b_exif6.jpg")]); await waitUntil(`!document.getElementById("controls").hidden`);
    await ev(`(document.getElementById("target").value = 150, document.getElementById("maxW").value = 600, document.getElementById("maxH").value = 800)`);
    await click("#go"); await waitUntil(`!document.getElementById("result").hidden`, 30000);
    check(`${tag} · EXIF yönü: yan kaydedilmiş dikey fotoğraf dikey çıkıyor`, await ev(`document.getElementById("statAfter").textContent.replace(/^\\d+ KB/, "")`), "600×800 px");
    await setFiles("#file", [path.join(FX, "a", "x_sahte.heic")]); await waitUntil(`!document.getElementById("controls").hidden`);
    await click("#go"); await waitUntil(`document.getElementById("verdict").textContent === ${JSON.stringify(S.bad)}`, 30000);
    check(`${tag} · açılamayan dosyada anlaşılır hata, düğme eski hâlinde`, await ev(`[document.getElementById("verdict").className, document.getElementById("go").textContent, document.getElementById("go").disabled]`), ["verdict miss", S.go, false]);
  }

  /* ---------- O. Çevrimdışı: sayfa açıldıktan sonra bağlantı kesilir, üç araç da çalışır ---------- */
  if (section("O")) for (const l of LANGS) {
    const off = b.offline;
    const tag = `O ${l}`;
    // pdf
    await go(prefix(l) + "pdf.html"); await ev(HOOK); await waitUntil(`pdfjsLib.GlobalWorkerOptions.workerSrc.startsWith("blob:")`, 15000);
    await off(true);
    check(`${tag} · bağlantı gerçekten kesik`, await ev(`fetch(location.href, { cache: "no-store" }).then(() => "açık", () => "kesik")`), "kesik");
    await setFiles("#fileM", [A, B]); await waitUntil(`document.querySelectorAll("#listM li").length === 2`);
    await click("#mergeGo"); await waitUntil(`document.getElementById("msgM").className.includes("ok")`, 20000);
    check(`${tag} · pdf: çevrimdışı birleştirme`, (await ev(`${PDFINFO}(window.__dl.at(-1).href)`)).length, 5);
    await click("#tabPages"); await setFiles("#fileP", [A]); await waitUntil(`document.querySelectorAll("#gridP .pg canvas").length === 3`, 20000);
    await click("#pagesGo"); await waitUntil(`document.getElementById("msgP").className.includes("ok")`, 20000);
    check(`${tag} · pdf: çevrimdışı sayfa seçme (pdf.js worker dahil)`, (await ev(`${PDFINFO}(window.__dl.at(-1).href)`)).length, 3);
    await off(false);
    // foto
    await go(prefix(l) + "foto.html"); await off(true);
    await setFiles("#file", [path.join(FX, "a", "d_yatay.jpg")]); await waitUntil(`!document.getElementById("controls").hidden`);
    await click("#go"); await waitUntil(`!document.getElementById("result").hidden`, 30000);
    check(`${tag} · foto: çevrimdışı küçültme`, await ev(`document.getElementById("verdict").className`), "verdict ok");
    await off(false);
    // foto-pdf
    await go(prefix(l) + "foto-pdf.html"); await waitUntil(`!!window.PDFLib`, 15000); await off(true);
    await setFiles("#file", fs.readdirSync(path.join(FX, "a")).map(f => path.join(FX, "a", f))); await waitUntil(`document.getElementById("loadText").hidden && items.length === 6`, 30000);
    await click("#make"); await waitUntil(`!document.getElementById("done").hidden`, 60000);
    check(`${tag} · foto-pdf: çevrimdışı PDF`, await ev(`document.getElementById("resStat").textContent.startsWith(${JSON.stringify(fill(typeof I18N[l]["foto-pdf"].done === "string" ? I18N[l]["foto-pdf"].done : I18N[l]["foto-pdf"].done.other, { n: 6, size: "" }).trim())})`), true);
    await off(false);
  }

  await finish(b, { ignore: /ERR_INTERNET_DISCONNECTED/ });            // bağlantıyı bilerek kestiğimiz andaki kayıt
})().catch(crash);
