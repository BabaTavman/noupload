/* ==================================================================
   Üretilen dosyalar ve üretici — tarayıcı gerekmez, saniyeler sürer.
     1  her sayfa: <html lang>, title, description, canonical, hreflang + x-default,
        dil bağlantıları, şablon artığı yok, bağlantı bütünlüğü, dış kaynak yok
     2  sitemap.xml ve robots.txt
     3  build.js davranışı (deponun geçici bir kopyasında): tekrarlanabilirlik, CRLF/BOM,
        "yeni dil = tek dosya", hatalı girdide açık hata, bayat çıktıların fark edilmesi
================================================================== */
"use strict";
const fs = require("fs"), path = require("path");
const { reporter, copyRepo, runBuild, spareLangs, ROOT, TMP, config, prefix, fileOf, absUrl, i18n } = require("./harness.js");
const { check, finish, crash } = reporter();
const LANGS = config.langs, PAGES = config.pages, SITE = config.site;
const I18N = Object.fromEntries(LANGS.map(l => [l, i18n(l)]));
const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const all = (text, re) => [...text.matchAll(re)].map(m => m.slice(1));
const outFile = (l, p) => prefix(l) + p + ".html";
// aynı sayfanın başka dildeki göreli adresi (build.js'teki relUrl ile aynı kural, bağımsız yazıldı)
const relHref = (from, to, p) => ((from === config.defaultLang ? "" : "../") + prefix(to) + fileOf(p)) || "./";

try {
  /* ---------- 1. Üretilen sayfalar ---------- */
  const titles = [], descs = [];
  for (const l of LANGS) for (const p of PAGES) {
    const file = outFile(l, p), html = fs.readFileSync(path.join(ROOT, file), "utf8"), tag = `1 ${file}`;
    const head = html.slice(0, html.indexOf("</head>"));
    const title = all(head, /<title>([^<]*)<\/title>/g), desc = all(head, /<meta name="description" content="([^"]*)">/g), canon = all(head, /<link rel="canonical" href="([^"]*)">/g);
    check(`${tag} · <html lang>, tek <title>, tek description, tek canonical`, [all(html, /<html lang="([^"]*)">/g), title.length, desc.length, canon.length], [[[l]], 1, 1, 1]);
    check(`${tag} · title ve description i18n/${l}.json'dan`, [unesc(title[0][0]), unesc(desc[0][0])], [I18N[l][p].docTitle, I18N[l][p].description]);
    check(`${tag} · canonical kendi adresi (ana sayfa klasör adresiyle)`, canon[0][0], absUrl(l, p));
    check(`${tag} · hreflang: her dil (kendisi dahil) + x-default`, all(head, /<link rel="alternate" hreflang="([^"]*)" href="([^"]*)">/g), [...LANGS.map(x => [x, absUrl(x, p)]), ["x-default", absUrl(config.xDefault, p)]]);
    check(`${tag} · description 70–170 karakter, title en çok 65`, [unesc(desc[0][0]).length >= 70 && unesc(desc[0][0]).length <= 170, unesc(title[0][0]).length <= 65], [true, true]);
    check(`${tag} · <head> içeriği <meta charset> ile başlıyor (BOM ya da başka karakter yok)`, /<head>\n<meta charset="utf-8">/.test(html) && !html.includes("\uFEFF"), true);
    titles.push(title[0][0]); descs.push(desc[0][0]);
    check(`${tag} · şablon artığı yok`, ["{{", "data-t=", "noindex", "build:remove", "cdnjs", "applyLang"].filter(x => html.includes(x)), []);
    const links = all(html, /<a class="langbtn" href="([^"]*)" hreflang="([^"]*)" lang="([^"]*)">([^<]*)<\/a>/g);
    const others = LANGS.filter(x => x !== l);
    check(`${tag} · dil bağlantıları: aynı sayfanın öteki dil(ler)deki adresi`, links, others.map(o => [relHref(l, o, p), o, o, I18N[o].lang.name]));
    check(`${tag} · dil bağlantılarının çözüldüğü adres = o dilin canonical'ı`, links.map(k => new URL(k[0], absUrl(l, p)).href), others.map(o => absUrl(o, p)));
    // yüklenen kaynaklar yerel; dış adres yalnızca tıklanan bağlantı olabilir
    const body = html.replace(/<script>[\s\S]*?<\/script>/g, "");
    const loaded = all(body, /<(?:script|img|iframe|source|video|audio)\b[^>]*?\ssrc="([^"]*)"/g).concat(all(body, /<link\b[^>]*?rel="(?:stylesheet|preload|modulepreload|manifest)"[^>]*?\shref="([^"]*)"/g)).map(m => m[0]);
    check(`${tag} · yüklenen betik/stil/görsel yerel (dış istek yok)`, loaded.filter(h => /^(https?:)?\/\//.test(h)), []);
    const refs = all(body, /\s(?:href|src)="([^"]*)"/g).map(m => m[0]).filter(h => !h.startsWith("data:") && !h.startsWith("#"));
    const broken = refs.filter(h => !/^https?:/.test(h)).filter(h => { const f = path.join(ROOT, path.dirname(file), h.split("#")[0]); return !(fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, "index.html")))); });
    check(`${tag} · bütün yerel bağlantılar ve dosyalar yerinde`, broken, []);
  }
  const N = LANGS.length * PAGES.length;
  check(`1 ${N} sayfanın title'ı da description'ı da birbirinden farklı`, [new Set(titles).size, new Set(descs).size], [N, N]);
  check(`1 kök adresteki sayfalar varsayılan dilde (${config.defaultLang}) — eski bağlantılar bozulmadı`, PAGES.map(p => new RegExp(`<html lang="${config.defaultLang}">`).test(fs.readFileSync(path.join(ROOT, p + ".html"), "utf8"))), PAGES.map(() => true));

  {
    // ortak stil dosyası: yazı tipleri dahil her url() yerel ve yerinde; Google Fonts'a (ya da başka bir yere) istek yok
    const css = fs.readFileSync(path.join(ROOT, "assets/site.css"), "utf8");
    const urls = all(css, /url\(\s*["']?([^"')]+)["']?\s*\)/g).map(m => m[0]);
    check("1 assets/site.css · yazı tipi dosyaları yerel ve yerinde (4 dosya)", [urls.length, urls.filter(u => /^(https?:)?\/\//.test(u) || !fs.existsSync(path.join(ROOT, "assets", u)))], [4, []]);
    const sources = ["assets/site.css", "assets/site.js", ...LANGS.flatMap(l => PAGES.map(p => outFile(l, p)))];
    check("1 hiçbir sayfada ve ortak dosyada dış yazı tipi / CDN adresi geçmiyor", sources.filter(f => /fonts\.googleapis|fonts\.gstatic|@import|cdnjs|jsdelivr|unpkg/.test(fs.readFileSync(path.join(ROOT, f), "utf8"))), []);
    // sayfaların satır içi <style> blokları: url() yalnızca data: ya da yerel olabilir (üstüne gelince / belli genişlikte doğan istek tarayıcı testinde görünmez)
    const pages = LANGS.flatMap(l => PAGES.map(p => outFile(l, p)));
    const styleOf = f => all(fs.readFileSync(path.join(ROOT, f), "utf8"), /<style[^>]*>([\s\S]*?)<\/style>/g).map(m => m[0]).join("\n");
    check("1 sayfaların <style> bloklarında dış adrese url() yok", pages.flatMap(f => all(styleOf(f), /url\(\s*["']?([^"')]+)["']?\s*\)/g).map(m => m[0]).filter(u => /^(https?:)?\/\//.test(u)).map(u => f + ": " + u)), []);
    // hareket: yalnızca ana sayfada "draw" (bir kez) ve "pulse" (sürekli); başka hiçbir yerde @keyframes ya da sonsuz animasyon yok (gizli öğelerinki tarayıcı testinde görünmez)
    const motion = f => { const t = f.endsWith(".css") ? fs.readFileSync(path.join(ROOT, f), "utf8") : styleOf(f); return [all(t, /@keyframes\s+([\w-]+)/g).map(m => m[0]).sort().join(), (t.match(/\binfinite\b/g) || []).length].join(" / "); };
    check("1 @keyframes ve sonsuz animasyon: yalnızca ana sayfada draw + pulse (tek infinite)", Object.fromEntries(["assets/site.css", ...pages].map(f => [f, motion(f)]).filter(([f, v]) => v !== (/(^|\/)index\.html$/.test(f) ? "draw,pulse / 1" : " / 0"))), {});
    const faces = all(css, /@font-face\s*\{([^}]*)\}/g).map(m => m[0]);
    check("1 her @font-face font-display: swap kullanıyor", [faces.length, faces.every(x => /font-display:\s*swap/.test(x))], [4, true]);
  }

  /* ---------- 2. sitemap.xml + robots.txt ---------- */
  {
    const sm = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
    check(`2 sitemap: ${N} adres = sayfaların canonical'ları`, all(sm, /<loc>([^<]*)<\/loc>/g).map(m => m[0]), LANGS.flatMap(l => PAGES.map(p => absUrl(l, p))));
    check("2 sitemap: her adreste bütün diller + x-default", all(sm, /<url>([\s\S]*?)<\/url>/g).map(m => all(m[0], /<xhtml:link rel="alternate" hreflang="([^"]*)" href="[^"]*"\/>/g).map(x => x[0]).join()), Array(N).fill([...LANGS, "x-default"].join()));
    check("2 sitemap: XML bildirimi, ad alanları, kapanış", [sm.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'), sm.trimEnd().endsWith("</urlset>")], [true, true]);
    check("2 robots.txt", fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
  }

  /* ---------- 3. build.js davranışı ---------- */
  {
    check("3 depodaki üretilmiş dosyalar güncel (node build.js --check)", runBuild(ROOT, "--check").code, 0);
    const T = copyRepo(path.join(TMP, "build-test"), { withLib: false });
    const outputs = [...LANGS.flatMap(l => PAGES.map(p => outFile(l, p))), "sitemap.xml", "robots.txt"];
    const snap = () => JSON.stringify(outputs.map(f => fs.readFileSync(path.join(T, f), "utf8")));
    const before = snap();
    const put = (rel, text) => fs.writeFileSync(path.join(T, rel), text), get = rel => fs.readFileSync(path.join(T, rel), "utf8");
    let r = runBuild(T);
    check("3 yeniden üretmek hiçbir şeyi değiştirmiyor", [r.code, /hepsi güncel/.test(r.out), snap() === before], [0, true, true]);

    const crlfFiles = ["src/pdf.html", "src/partials/head.html", `i18n/${config.defaultLang}.json`, "src/partials/card.html"], keep = Object.fromEntries(crlfFiles.map(f => [f, get(f)]));
    for (const f of crlfFiles) put(f, "\uFEFF" + keep[f].replace(/\r?\n/g, "\r\n"));
    r = runBuild(T); check("3 kaynaklar CRLF ve BOM'lu olsa da çıktı bayt bayt aynı", [r.code, snap() === before], [0, true]);
    for (const f of crlfFiles) put(f, keep[f]);

    const tpl = get("src/pdf.html");
    put("src/pdf.html", tpl.replace('<meta name="robots" content="noindex"><!-- build:remove', '<meta name="robots" content="noindex">\n<!-- build:remove'));
    r = runBuild(T); check("3 şablondaki noindex işareti etiketten ayrılırsa üretim durur (site dizinden düşmesin)", [r.code, /robots meta etiketi kaldı/.test(r.out)], [1, true]);
    put("src/pdf.html", tpl.replace("{{t.title}}", "{{t.olmayanAnahtar}}")); r = runBuild(T); check("3 şablonda çevirisi olmayan anahtar: hata", [r.code, /\{\{t\.olmayanAnahtar\}\}/.test(r.out)], [1, true]);
    put("src/pdf.html", tpl.replace("{{t.title}}", "{{bilinmeyen}}")); r = runBuild(T); check("3 bilinmeyen değişken: hata", [r.code, /bilinmeyen değişken/.test(r.out)], [1, true]);
    put("src/pdf.html", tpl);

    const bj = get("build.js");
    put("build.js", bj.replace(JSON.stringify(SITE), '"https://ornek.com"')); r = runBuild(T);
    check("3 SITE sonunda / olmasa da adresler doğru", [r.code, get(outFile(config.xDefault, "pdf")).includes(`<link rel="canonical" href="https://ornek.com/${prefix(config.xDefault)}pdf.html">`), get("sitemap.xml").includes("<loc>https://ornek.com/</loc>")], [0, true, true]);
    put("build.js", bj); runBuild(T);

    // yeni dil = tek dosya
    const [code, region] = [spareLangs(1)[0], "pt-BR"];
    const base = JSON.parse(get(`i18n/${config.xDefault}.json`));
    const lang = (c, name, patch = d => d) => { const d = patch(JSON.parse(JSON.stringify(base))); d.lang = { name, locale: c }; put(`i18n/${c}.json`, JSON.stringify(d, null, 2)); };
    lang(code, "Yeni Dil", d => { d.pdf.docTitle = "Yeni dilde PDF aracı — birleştir, seç, döndür"; return d; });
    r = runBuild(T);
    const newPdf = fs.existsSync(path.join(T, code, "pdf.html")) ? get(`${code}/pdf.html`) : "", rootPdf = get("pdf.html");
    check(`3 i18n/${code}.json eklemek yetiyor: /${code}/ altında bütün sayfalar`, [r.code, PAGES.map(p => fs.existsSync(path.join(T, code, p + ".html")))], [0, PAGES.map(() => true)]);
    check("3 …yeni dilin sayfası: lang, title, canonical, ../ yolları", [new RegExp(`<html lang="${code}">`).test(newPdf), newPdf.includes("<title>Yeni dilde PDF aracı — birleştir, seç, döndür</title>"), newPdf.includes(`<link rel="canonical" href="${SITE}${code}/pdf.html">`), newPdf.includes('src="../lib/pdf-lib.min.js"'), newPdf.includes('href="../assets/site.css"')], [true, true, true, true, true]);
    const expectLangs = [config.defaultLang, ...[...LANGS.filter(x => x !== config.defaultLang), code].sort((a, b) => a.localeCompare(b))];
    check("3 …bütün dillerin sayfalarına yeni hreflang eklendi; kök sayfada her dile bağlantı", [all(rootPdf, /hreflang="([^"]*)" href/g).map(m => m[0]), all(rootPdf, /<a class="langbtn" href="([^"]*)" hreflang="[^"]*" lang="[^"]*">([^<]*)<\/a>/g).map(m => m[0])], [[...expectLangs, "x-default"], expectLangs.slice(1).map(o => `${o}/pdf.html`)]);
    check("3 …yeni dilin sayfasından öteki dillere yollar", all(newPdf, /<a class="langbtn" href="([^"]*)"/g).map(m => m[0]), expectLangs.filter(x => x !== code).map(o => relHref(code, o, "pdf")));
    check(`3 …sitemap ${N + PAGES.length} adres`, (get("sitemap.xml").match(/<loc>/g) || []).length, N + PAGES.length);
    lang(region, "Português"); r = runBuild(T);
    check("3 bölgeli dil kodu (pt-BR) da çalışıyor", [r.code, fs.existsSync(path.join(T, region, "pdf.html")), get("pdf.html").includes(`hreflang="${region}"`)], [0, true, true]);
    fs.rmSync(path.join(T, "i18n", region + ".json")); fs.rmSync(path.join(T, region), { recursive: true });

    // hatalı girdi: açık hata, hiçbir dosyaya dokunmadan
    const good = get(`i18n/${code}.json`), stamp = fs.statSync(path.join(T, code, "pdf.html")).mtimeMs;
    const broken = JSON.parse(good); delete broken.pdf.title; broken.foto.fazladan = "x"; put(`i18n/${code}.json`, JSON.stringify(broken));
    r = runBuild(T); check("3 eksik/fazla çeviri anahtarı: anahtarı söyleyip duruyor, hiçbir dosyaya dokunmuyor", [r.code, r.out.includes(`i18n/${code}.json: "pdf.title" eksik`), /"foto\.fazladan" fazla/.test(r.out), fs.statSync(path.join(T, code, "pdf.html")).mtimeMs === stamp], [1, true, true, true]);
    put(`i18n/${code}.json`, good.slice(0, -20)); r = runBuild(T); check("3 bozuk JSON: anlaşılır hata", [r.code, r.out.includes(`i18n/${code}.json okunamadı`)], [1, true]);
    const badLocale = JSON.parse(good); badLocale.lang.locale = "xx_YY"; put(`i18n/${code}.json`, JSON.stringify(badLocale));
    r = runBuild(T); check("3 geçersiz lang.locale: hata", [r.code, /lang\.locale "xx_YY" geçerli değil/.test(r.out)], [1, true]);
    put(`i18n/${code}.json`, good);
    fs.copyFileSync(path.join(T, `i18n/${code}.json`), path.join(T, "i18n/en_GB.json")); r = runBuild(T);
    check("3 yanlış adlı dil dosyası sessizce atlanmıyor", [r.code, /en_GB\.json/.test(r.out)], [1, true]);
    fs.rmSync(path.join(T, "i18n/en_GB.json"));

    // HTML ve betik kaçışları
    const x = JSON.parse(good); x.pdf.title = `A & B <i>"x"</i>`; x.pdf.bad = `</script><script>alert(1)</script>`; put(`i18n/${code}.json`, JSON.stringify(x)); r = runBuild(T);
    const esc = get(`${code}/pdf.html`);
    check("3 metinler HTML'e ve betiğe güvenle gömülüyor (& < > \" ve </script>)", [r.code, esc.includes("<h1>A &amp; B &lt;i&gt;&quot;x&quot;&lt;/i&gt;</h1>"), (esc.match(/<\/script>/g) || []).length === (get("pdf.html").match(/<\/script>/g) || []).length, esc.includes("\\u003c/script\\u003e")], [0, true, true, true]);
    put(`i18n/${code}.json`, good); runBuild(T);

    // kaldırılan dilin bayat sayfaları
    fs.rmSync(path.join(T, `i18n/${code}.json`)); r = runBuild(T); const c = runBuild(T, "--check");
    check("3 kaldırılan dilin bayat sayfaları fark ediliyor: üretim uyarıyor, --check başarısız", [r.code, r.out.includes("UYARI") && r.out.includes(`${code}/index.html`), c.code], [0, true, 1]);
    fs.rmSync(path.join(T, code), { recursive: true }); check("3 …bayat klasör silinince --check yeniden geçiyor", runBuild(T, "--check").code, 0);
    fs.rmSync(T, { recursive: true, force: true });
  }
  finish();
} catch (e) { crash(e); }
