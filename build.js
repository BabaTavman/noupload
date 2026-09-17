#!/usr/bin/env node
/* ==================================================================
   NoUpload — site üretici (sıfır bağımlılık, yalnızca Node)

     node build.js           şablonlardan sayfaları üretir
     node build.js --check   üretilmiş dosyalar güncel mi diye bakar, yazmaz
     node build.js --print-config   ayarları (adres, diller, sayfalar) JSON olarak yazar; testler buradan okur

   Girdi
     src/*.html            sayfa şablonları (index, pdf, foto, foto-pdf)
     src/partials/*.html   şablonların ortak parçaları
     src/icons/*.svg       araç kartlarının simgeleri
     i18n/*.json           her dil için bir dosya (dosya adı = dil kodu)

   Çıktı
     varsayılan dil (tr) → kök:  index.html, pdf.html …
     diğer diller        → /<kod>/:  en/index.html, en/pdf.html …
     sitemap.xml, robots.txt

   Yeni dil eklemek: i18n/en.json'u i18n/de.json diye kopyala, çevir,
   "node build.js" çalıştır. Başka hiçbir yere dokunmak gerekmez.

   Şablon dili
     {{t.anahtar}}   çeviri metni: önce sayfanın bölümünde, sonra "common"da aranır;
                     HTML'e güvenle girsin diye & < > " kaçışlanır
     {{degisken}}    üreticinin verdiği değer (aşağıda "vars")
     {{> parca}}     src/partials/parca.html dosyasını buraya koyar
     içinde "build:remove" geçen satır çıktıya alınmaz
================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

/* ------------------------------ AYARLAR ------------------------------ */
const SITE = "https://babatavman.github.io/noupload/".replace(/\/*$/, "/");  // sitenin yayındaki adresi; alan adı değişirse yalnızca burası
const DEFAULT_LANG = "tr";                              // kök adreste yayınlanan dil (mevcut bağlantılar bozulmasın)
const X_DEFAULT = "en";                                 // dili eşleşmeyen ziyaretçiye önerilen sürüm (hreflang="x-default")
const PAGES = ["index", "pdf", "foto", "foto-pdf"];     // src/<ad>.html
const TOOLS = ["pdf", "foto", "foto-pdf"];              // kartların sırası; her biri aynı adlı sayfa ve src/icons/<ad>.svg

const ROOT = __dirname;
const fail = msg => { console.error("HATA: " + msg); process.exit(1); };
// Windows düzenleyicilerinin dosya başına koyduğu görünmez BOM atılır (yoksa <head>'in içine düşüp etiketleri <body>'ye iter),
// satır sonları tek biçime getirilir.
const read = (...p) => {
  const file = path.join(ROOT, ...p);
  if (!fs.existsSync(file)) fail(`${p.join("/")} yok`);
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
};
const CHECK = process.argv.includes("--check");

/* ------------------------------ DİLLER ------------------------------ */
const i18nFiles = fs.readdirSync(path.join(ROOT, "i18n")).filter(f => f.toLowerCase().endsWith(".json"));
{ // Dosya adı = dil kodu (tr, en, de, pt-BR …). Yanlış adlı dosya sessizce atlanmasın.
  const bad = i18nFiles.filter(f => { const code = f.replace(/\.json$/, ""); try { return Intl.getCanonicalLocales(code)[0] !== code; } catch (e) { return true; } });
  if (bad.length) fail(`i18n/ içindeki dosya adı geçerli bir dil kodu değil: ${bad.join(", ")} (örnek: de.json, pt-BR.json)`);
}
const langs = i18nFiles
  .map(f => f.replace(/\.json$/, ""))
  .sort((a, b) => (b === DEFAULT_LANG) - (a === DEFAULT_LANG) || a.localeCompare(b));

if (!langs.includes(DEFAULT_LANG)) fail(`i18n/${DEFAULT_LANG}.json yok (varsayılan dil).`);
if (!langs.includes(X_DEFAULT)) fail(`i18n/${X_DEFAULT}.json yok (x-default dili).`);

// Testler ayarları buradan okur (kopyası tutulmasın diye): node build.js --print-config
if (process.argv.includes("--print-config")) {
  console.log(JSON.stringify({ site: SITE, defaultLang: DEFAULT_LANG, xDefault: X_DEFAULT, pages: PAGES, tools: TOOLS, langs }));
  process.exit(0);
}

const dict = {};
for (const code of langs) {
  try { dict[code] = JSON.parse(read("i18n", code + ".json")); }
  catch (e) { fail(`i18n/${code}.json okunamadı: ${e.message}`); }
}

// Bir sözlükteki bütün anahtar yolları: "pdf.nFiles" gibi. Çoğul nesnesi ({one, other}) tek değer sayılır.
const isPlural = v => v && typeof v === "object" && typeof v.other === "string";
function keyPaths(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !isPlural(v) ? keyPaths(v, prefix + k + ".") : [prefix + k]);
}
{ // Her dilde aynı anahtarlar olmalı: eksik çeviri sayfada boşluk olarak değil, burada hata olarak görünsün
  const ref = new Set(keyPaths(dict[DEFAULT_LANG]));
  const problems = [];
  for (const code of langs) {
    const own = new Set(keyPaths(dict[code]));
    for (const k of ref) if (!own.has(k)) problems.push(`i18n/${code}.json: "${k}" eksik`);
    for (const k of own) if (!ref.has(k)) problems.push(`i18n/${code}.json: "${k}" fazla (i18n/${DEFAULT_LANG}.json'da yok)`);
    for (const need of ["lang.name", "lang.locale", "common", ...PAGES]) {
      if (need.split(".").reduce((o, k) => o && o[k], dict[code]) === undefined) problems.push(`i18n/${code}.json: "${need}" bölümü yok`);
    }
    // lang.locale sayıları biçimlerken tarayıcıya verilir ("12,4 MB"); geçersizse sayfa o dilde hata verir
    try { new Intl.NumberFormat(dict[code].lang && dict[code].lang.locale); }
    catch (e) { problems.push(`i18n/${code}.json: lang.locale "${dict[code].lang.locale}" geçerli değil (örnek: "de-DE")`); }
  }
  if (problems.length) fail("çeviri dosyaları uyuşmuyor:\n  " + problems.join("\n  "));
}

/* ------------------------------ ADRESLER ------------------------------ */
const prefix = code => code === DEFAULT_LANG ? "" : code + "/";            // dilin klasörü
const toRoot = code => code === DEFAULT_LANG ? "" : "../";                 // o klasörden köke dönüş
const fileOf = page => page === "index" ? "" : page + ".html";             // ana sayfa klasör adresiyle anılır
const absUrl = (code, page) => SITE + prefix(code) + fileOf(page);
const relUrl = (from, to, page) => (toRoot(from) + prefix(to) + fileOf(page)) || "./";   // aynı sayfanın başka dildeki adresi

/* ------------------------------ ŞABLON ------------------------------ */
const escapeHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// <script> içine gömülen JSON: "</script>" ya da satır ayırıcılar betiği bozmasın
const jsonForScript = o => JSON.stringify(o, null, 1)
  .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const dig = (obj, dotted) => dotted.split(".").reduce((o, k) => (o && typeof o === "object") ? o[k] : undefined, obj);

const partialCache = {};
function partial(name) {
  if (!(name in partialCache)) {
    const file = path.join("src", "partials", name + ".html");
    if (!fs.existsSync(path.join(ROOT, file))) fail(`${file} yok ({{> ${name}}})`);
    partialCache[name] = read(file).replace(/\n$/, "");
  }
  return partialCache[name];
}

function render(text, ctx, where, depth = 0) {
  if (depth > 8) fail(`${where}: {{> …}} iç içe çok derin (döngü mü?)`);
  text = text.split("\n").filter(line => !line.includes("build:remove")).join("\n");
  text = text.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (m, name) => render(partial(name), ctx, `partials/${name}.html`, depth + 1));
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, key) => {
    if (key.startsWith("t.")) {
      const k = key.slice(2);
      let v = dig(ctx.page, k);
      if (v === undefined) v = dig(ctx.common, k);
      if (v === undefined) fail(`${where}: {{${key}}} için i18n/${ctx.lang}.json içinde çeviri yok`);
      if (typeof v !== "string") fail(`${where}: {{${key}}} düz metin değil (çoğul ya da bölüm); HTML'e yalnızca düz metin konabilir`);
      return escapeHtml(v);
    }
    if (!(key in ctx.vars)) fail(`${where}: {{${key}}} bilinmeyen değişken`);
    return ctx.vars[key];
  });
}

/* ------------------------------ ÜRETİM ------------------------------ */
{ const lost = TOOLS.filter(t => !PAGES.includes(t)); if (lost.length) fail(`TOOLS içindeki "${lost.join(", ")}" PAGES listesinde yok`); }
const outputs = new Map();     // göreli yol → içerik
const icons = Object.fromEntries(TOOLS.map(t => [t, read("src", "icons", t + ".svg").trim()]));

for (const code of langs) {
  // "{toolCount}" gibi üretim zamanı değerleri bütün metinlerde yerine konur
  const fill = v => typeof v === "string" ? v.replace(/\{toolCount\}/g, TOOLS.length)
    : Array.isArray(v) ? v.map(fill)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  const D = fill(dict[code]);

  for (const page of PAGES) {
    const ctx = { lang: code, common: D.common, page: D[page], vars: {} };
    const others = langs.filter(l => l !== code);

    // <link rel="alternate" hreflang>: her dil (kendisi dahil) + x-default
    const alternates = [
      ...langs.map(l => `<link rel="alternate" hreflang="${l}" href="${absUrl(l, page)}">`),
      `<link rel="alternate" hreflang="x-default" href="${absUrl(X_DEFAULT, page)}">`
    ].join("\n");

    // Dil değiştirici: aynı sayfanın diğer dil(ler)deki adresine giden bağlantı
    const langLinks = others.map(l =>
      `<a class="langbtn" href="${relUrl(code, l, page)}" hreflang="${l}" lang="${l}">${escapeHtml(dict[l].lang.name)}</a>`
    ).join("\n      ");

    const card = tool => render(partial("card"), { ...ctx, vars: {
      "tool.href": tool + ".html",
      "tool.icon": icons[tool],
      "tool.title": escapeHtml(D.common.tools[tool].title),
      "tool.desc": escapeHtml(D.common.tools[tool].desc)
    } }, "partials/card.html");

    // Sayfa betiklerinin kullandığı metinler: ortak + bu sayfanınkiler (yalnızca bu dilde)
    const { tools, ...commonFlat } = D.common;
    const strings = { ...commonFlat, ...D[page], locale: D.lang.locale };

    ctx.vars = {
      lang: code,
      langCount: langs.length,
      root: toRoot(code),                       // assets/ ve lib/ için: "" ya da "../"
      page,                                     // "pdf" → üst çubukta "/ pdf"
      canonical: absUrl(code, page),
      alternates,
      langLinks,
      toolCards: TOOLS.map(card).join("\n"),                                   // ana sayfa: bütün araçlar
      otherToolCards: TOOLS.filter(t => t !== page).map(card).join("\n"),     // araç sayfası: kendisi dışındakiler
      strings: jsonForScript(strings)
    };

    let html = render(read("src", page + ".html"), ctx, `src/${page}.html`);
    const left = html.match(/\{\{[^}]*\}\}/);
    if (left) fail(`src/${page}.html (${code}): çözülmeyen yer tutucu ${left[0]}`);
    // Şablondaki "noindex" satırı yalnızca src/ içindir. "build:remove" işareti ondan ayrılırsa (ör. satır bölünürse)
    // etiket üretilen sayfaya sızar ve site arama sonuçlarından düşer — burada durdurulur.
    if (/<meta[^>]+name=["']?robots/i.test(html)) fail(`src/${page}.html (${code}): üretilen sayfada robots meta etiketi kaldı; "build:remove" işareti etiketle aynı satırda olmalı`);
    if (html.includes("\uFEFF")) fail(`src/${page}.html (${code}): çıktıda BOM karakteri var`);
    outputs.set(prefix(code) + page + ".html", html);
  }
}

// sitemap.xml — her adres, bütün dil eşleriyle birlikte
{
  const urls = langs.flatMap(code => PAGES.map(page => [
    "  <url>",
    `    <loc>${absUrl(code, page)}</loc>`,
    ...langs.map(l => `    <xhtml:link rel="alternate" hreflang="${l}" href="${absUrl(l, page)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${absUrl(X_DEFAULT, page)}"/>`,
    "  </url>"
  ].join("\n")));
  outputs.set("sitemap.xml", [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>", ""
  ].join("\n"));
  outputs.set("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
}

/* ------------------------------ BAYAT DOSYALAR ------------------------------ */
// Bir dil ya da sayfa kaldırılınca eski çıktısı yayında kalır. Silmek sahibinin işi; burada yalnızca fark edilir:
// kökte ve bir alt klasörde, bu sitenin canonical adresini taşıyan ama artık üretilmeyen .html dosyaları.
const stale = [];
for (const dir of ["", ...fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory() && !["src", "i18n", "assets", "lib", "node_modules"].includes(d.name) && !d.name.startsWith(".")).map(d => d.name + "/")]) {
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith(".html"))) {
    if (!outputs.has(dir + f) && fs.readFileSync(path.join(ROOT, dir, f), "utf8").includes(`<link rel="canonical" href="${SITE}`)) stale.push(dir + f);
  }
}

/* ------------------------------ YAZ ------------------------------ */
let changed = 0;
for (const [rel, content] of outputs) {
  const file = path.join(ROOT, rel);
  const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
  if (old === content) continue;
  changed++;
  if (CHECK) { console.log("güncel değil: " + rel); continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log("yazıldı: " + rel);
}
if (stale.length) console.log(`UYARI: artık üretilmeyen ama yayında kalan sayfalar var (dil ya da sayfa kaldırıldıysa elle sil): ${stale.join(", ")}`);
if (CHECK && (changed || stale.length)) fail(changed ? `${changed} dosya güncel değil — "node build.js" çalıştır.` : "bayat sayfalar silinmeli.");
console.log(`${langs.join(", ")} · ${PAGES.length} sayfa · ${outputs.size} dosya · ${changed ? changed + " değişti" : "hepsi güncel"}`);
