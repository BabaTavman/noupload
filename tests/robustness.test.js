/* ==================================================================
   Sağlamlık — "ileride bozulmasın" diye yazılmış kontroller:
     R1  çok dilli üst çubuk: deponun geçici kopyalarına diller eklenir (bir ve üç fazladan dil);
         300–760px arasında taşma yok, bütün dil bağlantıları ekranda, tema yazısı değişince çubuk
         oynamıyor, kırıntı varken çubuk tek satır, ekran genişledikçe satır sayısı artmıyor
     R3  pdf.html: dosya adı HTML olarak yorumlanmıyor; pdf.js worker'ı alınamadıysa açık mesaj ve
         bağlantı gelince yenilemeden toparlanma; tek sayfalık PDF'te sayaç cümlesi;
         site.css yüklenemese de gizli bölümler gizli
   Tek bölüm: node tests/robustness.test.js R1
================================================================== */
"use strict";
const fs = require("fs"), path = require("path");
const { launch, reporter, copyRepo, runBuild, spareLangs, TMP, FX, config, prefix, rel, i18n, fill } = require("./harness.js");
const { ensureFixtures } = require("./fixtures.js");
const only = process.argv[2], section = id => !only || only === id;
const { check, finish, crash } = reporter();

// Geçici kopyaya dil ekler: x-default dilinin kopyası, bilerek uzun metinlerle (Almanca gibi uzun yazan diller için)
function addLang(dir, code, name) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, "i18n", config.xDefault + ".json"), "utf8").replace(/^﻿/, ""));
  d.lang = { name, locale: code }; d.common.back = "← Werkzeuge und mehr"; d.common.themeSystem = "Systemeinstellung";
  fs.writeFileSync(path.join(dir, "i18n", code + ".json"), JSON.stringify(d, null, 2));
}

(async () => {
  await ensureFixtures();
  const spare = spareLangs(3), NAMES = ["Deutsch", "Español", "Français"];
  const M1 = path.join(TMP, "langs-plus-1"), M3 = path.join(TMP, "langs-plus-3");
  if (section("R1")) {
    copyRepo(M1); addLang(M1, spare[0], NAMES[0]); check(`R1 ${config.langs.length + 1} dilli kopya üretildi`, runBuild(M1).code, 0);
    copyRepo(M3); spare.forEach((c, i) => addLang(M3, c, NAMES[i])); check(`R1 ${config.langs.length + 3} dilli kopya üretildi`, runBuild(M3).code, 0);
  }
  const b = await launch({ extraMounts: [["/plus1/", M1], ["/plus3/", M3]] }); const { ev, os, sleep } = b;
  await os("light");

  if (section("R1")) {
    const newLang = spare[0] + "/";
    const cases = [["/plus1/", config.langs.length + 1, true], ["/plus3/", config.langs.length + 3, true], [new URL(b.base).pathname + "/", config.langs.length, false]];
    for (const [mount, n, hasNew] of cases) {
      const pages = ["", ...config.tools.map(t => t + ".html"), ...(hasNew ? [newLang, newLang + config.tools.at(-1) + ".html"] : []), prefix(config.xDefault) + config.tools[0] + ".html"];
      for (const page of pages) {
        await b.mobile(300, 800); await b.navigate(b.origin + mount + page);
        const bad = [], barH = []; let flips = 0, crumbWrap = 0;
        for (let w = 300; w <= 760; w += 2) {
          await b.mobile(w, 800);
          await ev(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);          // resize olayı işlensin
          const seen = [];
          for (let i = 0; i < 3; i++) {
            const r = await ev(`(() => { const cw = document.documentElement.clientWidth, bar = document.querySelector(".bar");
              const out = [...bar.querySelectorAll("a, button")].filter(x => { const q = x.getBoundingClientRect(); return q.right > cw + .5 || q.left < -.5; }).length;
              const c = document.querySelector(".brand small"), lead = document.querySelector(".barlead"), btns = document.querySelector(".barbtns");
              return { over: document.documentElement.scrollWidth > cw, out, h: Math.round(bar.getBoundingClientRect().height), links: bar.querySelectorAll("a.langbtn").length,
                crumbAndWrapped: !!(c && getComputedStyle(c).display !== "none" && lead && btns.offsetTop > lead.offsetTop) }; })()`);
            if (r.over || r.out) bad.push(w); if (r.links !== n - 1) bad.push("bağlantı sayısı " + r.links);
            if (r.crumbAndWrapped) crumbWrap++; seen.push(r.h);
            await ev(`document.getElementById("theme").click()`);
          }
          if (new Set(seen).size > 1) flips++;
          barH.push(seen[0]);
        }
        const grew = barH.filter((h, i) => i && h > barH[i - 1]).length;
        check(`R1 ${n} dil · ${mount}${page || "(ana sayfa)"} · taşma yok, tema yazısı çubuğu oynatmıyor, kırıntı varken tek satır, genişledikçe satır artmıyor`, [[...new Set(bad)].slice(0, 6), flips, crumbWrap, grew], [[], 0, 0, 0]);
      }
    }
    await b.mobile(360, 800); await b.navigate(b.origin + "/plus3/"); await b.shot(path.join(TMP, "shots", "cok-dil-index-360.png"));
    await b.navigate(b.origin + "/plus3/" + config.tools.at(-1) + ".html"); await b.shot(path.join(TMP, "shots", "cok-dil-arac-360.png"));
  }

  if (section("R3")) {
    const A = path.join(FX, "pdf", "A-uc-sayfa.pdf"), ONE = path.join(FX, "pdf", "tek.pdf");
    for (const l of config.langs) {
      const page = rel(l, "pdf"), S = i18n(l).pdf;
      await b.size(1200, 800); await b.go(page);
      const x = await ev(`(async () => { const dt = new DataTransfer(); const bytes = await (await PDFLib.PDFDocument.create()).save();
        dt.items.add(new File([bytes], '<img src=x onerror="window.__xss=1">&amp;.pdf', { type: "application/pdf" })); dt.items.add(new File([bytes], "b.pdf", { type: "application/pdf" }));
        document.getElementById("dropM").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt })); await new Promise(r => setTimeout(r, 300));
        return { xss: window.__xss === 1, imgs: document.querySelectorAll("#listM img").length, shown: document.querySelector("#listM .nm").firstChild.textContent }; })()`);
      check(`R3 ${page} · dosya adı HTML olarak yorumlanmıyor, olduğu gibi gösteriliyor`, x, { xss: false, imgs: 0, shown: '<img src=x onerror="window.__xss=1">&amp;.pdf' });

      const before = b.problems.length;
      await b.send("Network.setBlockedURLs", { urls: ["*pdf.worker*"] }); await b.go(page); await sleep(300);
      await ev(`document.getElementById("tabPages").click()`); await b.setFiles("#fileP", [A]);
      await b.waitUntil(`!document.getElementById("msgP").hidden`, 15000);
      check(`R3 ${page} · worker alınamadıysa açık mesaj (PDF'e "bozuk" denmiyor)`, await ev(`[document.getElementById("msgP").textContent, document.getElementById("msgP").className, document.getElementById("cardP").hidden, document.querySelectorAll("#gridP canvas").length]`), [S.noWorker, "msg err", false, 0]);
      await b.send("Network.setBlockedURLs", { urls: [] });
      await b.setFiles("#fileP", [A]); await b.waitUntil(`document.querySelectorAll("#gridP canvas").length === 3`, 20000);
      check(`R3 ${page} · bağlantı gelince aynı dosya yeniden seçilebiliyor, sayfa yenilemeden çalışıyor`, await ev(`[document.getElementById("msgP").hidden, pdfjsLib.GlobalWorkerOptions.workerSrc.slice(0, 5), document.getElementById("countP").textContent]`), [true, "blob:", fill(S.nPages, { sel: 3, total: 3, n: 3 })]);
      b.problems.splice(before);                                                           // engellenen isteğin konsol kaydı beklenen bir şey

      await b.go(page); await ev(`document.getElementById("tabPages").click()`);
      await b.setFiles("#fileP", [ONE]); await b.waitUntil(`document.querySelectorAll("#gridP canvas").length === 1`, 20000);
      check(`R3 ${page} · tek sayfalık PDF'te sayaç cümlesi`, await ev(`document.getElementById("countP").textContent`), fill(S.nPages, { sel: 1, total: 1, n: 1 }));
    }
    const before = b.problems.length;
    await b.send("Network.setBlockedURLs", { urls: ["*site.css*"] }); await b.go(rel(config.defaultLang, "foto-pdf"));
    check("R3 site.css yüklenemese de gizli bölümler gizli", await ev(`["list", "opts", "goBar", "warn"].map(i => getComputedStyle(document.getElementById(i)).display)`), ["none", "none", "none", "none"]);
    await b.send("Network.setBlockedURLs", { urls: [] }); b.problems.splice(before);
  }

  fs.rmSync(M1, { recursive: true, force: true }); fs.rmSync(M3, { recursive: true, force: true });
  await finish(b);
})().catch(crash);
