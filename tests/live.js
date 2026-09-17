/* ==================================================================
   Yayındaki siteyi doğrular (build.js'teki SITE adresi). Push'tan birkaç dakika sonra:

     node tests/live.js

     1  yayınlanan dosyalar depodakilerle bayt bayt aynı mı, doğru türle mi sunuluyor
     2  her sayfa tarayıcıda: lang, canonical, hreflang, stil yüklenmiş, dil bağlantısı
     3  dil bağlantısı ve tema; sayfa açıldıktan sonra bağlantı kesilince araçlar çalışıyor
     4  bütün oturum boyunca site dışına hiç istek yok
   İnternet ister; `npm test` bunu çalıştırmaz.
================================================================== */
"use strict";
const fs = require("fs"), path = require("path");
const { launch, reporter, ROOT, FX, config, prefix, fileOf, rel, absUrl, i18n, fill } = require("./harness.js");
const { ensureFixtures, files } = require("./fixtures.js");
const { check, finish, crash } = reporter();
const SITE = config.site, LANGS = config.langs, PAGES = config.pages;
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".xml": "application/xml", ".txt": "text/plain" };

(async () => {
  await ensureFixtures();
  const published = [...LANGS.flatMap(l => PAGES.map(p => prefix(l) + p + ".html")), "assets/site.css", "assets/site.js", "lib/pdf-lib.min.js", "lib/pdf.min.js", "lib/pdf.worker.min.js", "sitemap.xml", "robots.txt"];
  for (const f of published) {
    const r = await fetch(SITE + f, { cache: "no-store" }), body = Buffer.from(await r.arrayBuffer());
    const local = fs.readFileSync(path.join(ROOT, f));
    const same = body.equals(local) || body.equals(Buffer.from(local.toString("utf8").replace(/\r\n/g, "\n")));   // Windows çalışma kopyasında CRLF olabilir
    check(`yayında ${f} · 200, depodakiyle aynı içerik, doğru tür`, [r.status, same, (r.headers.get("content-type") || "").split(";")[0]], [200, true, TYPES[path.extname(f)]]);
  }
  check("yayında ham şablon (src/pdf.html) noindex taşıyor", /<meta name="robots" content="noindex">/.test(await (await fetch(SITE + "src/pdf.html", { cache: "no-store" })).text()), true);

  const b = await launch(); const { ev } = b; await b.os("light"); await b.size(1200, 800);
  for (const l of LANGS) for (const p of PAGES) {
    await b.navigate(absUrl(l, p));
    const r = await ev(`({ lang: document.documentElement.lang, canon: document.querySelector('link[rel="canonical"]').href, alts: [...document.querySelectorAll('link[rel="alternate"]')].map(a => a.hreflang + "=" + a.href).join(" "),
      title: document.title, styled: getComputedStyle(document.querySelector(".brand .mark")).display, robots: !!document.querySelector('meta[name="robots"]'), links: [...document.querySelectorAll("a.langbtn")].map(a => a.href) })`);
    check(`yayında ${rel(l, p) || "(ana sayfa)"} · lang, canonical, hreflang, başlık, stil, dil bağlantıları`, r, { lang: l, canon: absUrl(l, p), alts: [...LANGS.map(x => `${x}=${absUrl(x, p)}`), `x-default=${absUrl(config.xDefault, p)}`].join(" "),
      title: i18n(l)[p].docTitle, styled: "grid", robots: false, links: LANGS.filter(x => x !== l).map(x => absUrl(x, p)) });
  }
  if (LANGS.length > 1) {
    const [from, to] = LANGS;
    await b.navigate(absUrl(from, "pdf")); await ev(`localStorage.clear()`); await b.click("#theme");
    { const w = b.waitLoad(); await b.click("a.langbtn"); await w; }
    check("yayında · dil bağlantısı aynı sayfanın öteki dildeki adresine götürüyor, tema korunuyor", await ev(`[location.href, document.documentElement.lang, document.documentElement.getAttribute("data-theme")]`), [absUrl(to, "pdf"), to, "dark"]);
    await ev(`localStorage.clear()`);
  }
  // çevrimdışı: sayfa açıldıktan sonra bağlantı kesilir
  const lang = LANGS.at(-1), S = i18n(lang);
  await b.navigate(absUrl(lang, "pdf")); await b.waitUntil(`pdfjsLib.GlobalWorkerOptions.workerSrc.startsWith("blob:")`, 30000);
  await b.offline(true);
  await b.click("#tabPages"); await b.setFiles("#fileP", [path.join(FX, "pdf", "A-uc-sayfa.pdf")]);
  await b.waitUntil(`document.querySelectorAll("#gridP canvas").length === 3`, 30000);
  check(`yayında · çevrimdışıyken ${rel(lang, "pdf")} üç sayfayı çiziyor`, await ev(`document.getElementById("countP").textContent`), fill(S.pdf.nPages, { sel: 3, total: 3, n: 3 }));
  await b.offline(false);
  await b.navigate(absUrl(lang, "foto-pdf")); await b.waitUntil(`!!window.PDFLib`, 30000);
  await b.offline(true);
  await b.setFiles("#file", files("a")); await b.waitUntil(`document.getElementById("loadText").hidden && items.length === 6`, 30000);
  await b.click("#make"); await b.waitUntil(`!document.getElementById("done").hidden`, 60000);
  check(`yayında · çevrimdışıyken ${rel(lang, "foto-pdf")} PDF üretiyor`, await ev(`document.getElementById("resStat").textContent`), t => t.startsWith(fill(S["foto-pdf"].done, { n: 6, size: "" })));
  await b.offline(false);

  await finish(b, { allow: [SITE], ignore: /ERR_INTERNET_DISCONNECTED/ });
})().catch(crash);
