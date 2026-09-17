/* ==================================================================
   Site geneli — her dil × her sayfa:
     A  tema düğmesi: üç durum, kalıcılık, dil bağlantısıyla öteki dile geçiş, "Geri" önbelleği
     B  marka: mercan kare içinde "N", kontrast, Windows kontrast teması
     C  dar ekran: yatay taşma yok, kırıntı sınırı, üst çubuk zıplamıyor
     D  "← Araçlar", araç kartları, "Diğer araçlar"
     F  tasarım sistemi: renk token'ları, yerel yazı tipleri, h1 boyutları, lekeler, hareket kuralları,
        kartların fare/dokunmatik davranışı, araç sayfası bileşenleri, küçük metinlerde kontrast
     E  ekran görüntüleri (tests/.tmp/shots)
   Tek bölüm: node tests/site.test.js C
================================================================== */
"use strict";
const fs = require("fs"), path = require("path");
const { launch, reporter, CONTRAST_AUDIT, ROOT, TMP, config, prefix, fileOf, rel, i18n } = require("./harness.js");
const SHOTS = path.join(TMP, "shots");
const only = process.argv[2];
const section = id => !only || only === id;

const LANGS = config.langs, PAGES = config.pages, TOOLS = config.tools;
const I18N = Object.fromEntries(LANGS.map(l => [l, i18n(l)]));
const LABEL = l => ({ dark: I18N[l].common.themeDark, light: I18N[l].common.themeLight, system: I18N[l].common.themeSystem });
// Beklenen zemin renkleri ortak stilden okunur: ilk --ground açık, ikincisi koyu
const GROUND = (([light, dark]) => ({ light, dark }))([...fs.readFileSync(path.join(ROOT, "assets/site.css"), "utf8").matchAll(/--ground:(#[0-9A-Fa-f]{6})/g)].map(m => m[1].toUpperCase()));
// Kırıntının ("/ pdf") gizlendiği en geniş ekran: her araç sayfasının kendi @media kuralından
const CRUMB_MAX = Object.fromEntries(TOOLS.map(p => [p, +fs.readFileSync(path.join(ROOT, p + ".html"), "utf8").match(/@media \(max-width:(\d+)px\)\{\.brand small\{display:none\}\}/)[1]]));
const card = (l, t) => [I18N[l].common.tools[t].title, I18N[l].common.tools[t].desc];
// Tasarımın renkleri (sitenin sahibinin verdiği değerler). green-text açık temada verilen #1E8F5A yerine #1A8050:
// verilen değer krem zeminde 3.96:1'de kalıyordu, küçük metin için 4.5:1 gerekiyor.
const TOKENS = {
  light: { ground: "#FFFBF3", surface: "#FFFFFF", ink: "#1C1B29", "ink-2": "#4E4B5C", "ink-3": "#6B687A", rule: "#E7E0CF", dash: "#C9BFA6", brand: "#FF5A3C", yellow: "#FFB800", green: "#2FBF71", "green-text": "#1A8050", blue: "#4361EE", "on-blue": "#FFFFFF", "on-yellow": "#1C1B29", "on-brand": "#1C1B29" },
  dark:  { ground: "#16141E", surface: "#211D2B", ink: "#F5F1E8", "ink-2": "#B7B2C4", "ink-3": "#8A8496", rule: "#34303F", dash: "#4A4557", brand: "#FF6F52", yellow: "#FFC93C", green: "#37D17F", "green-text": "#37D17F", blue: "#5B7CFA", "on-blue": "#16141E", "on-yellow": "#1C1B29", "on-brand": "#1C1B29" },
};
const TOOL_COLOR = { pdf: "--yellow", foto: "--brand", "foto-pdf": "--blue" };
const THEMES = [["light", null], ["dark", null], ["light", "dark"], ["dark", "light"]];       // [sistem, kayıtlı seçim]
// sayfada bir CSS değişkeninin hesaplanmış rengini "rgb(…)" olarak verir
const VAR = `const cssVar = n => { const i = document.createElement("i"); i.style.color = "var(" + n + ")"; document.body.append(i); const x = getComputedStyle(i).color; i.remove(); return x; };`;
const { check, finish, crash } = reporter();

(async () => {
  const b = await launch();
  const { ev, go, reload, os, size, mobile, click, sleep } = b;
  const basePath = new URL(b.base).pathname;                       // sitenin yayındaki yolu
  const fresh = async (p, stored) => { await go(p); await ev(`localStorage.clear()`); if (stored) await ev(`localStorage.setItem("noupload-theme", ${JSON.stringify(stored)})`); await reload(); };
  const state = () => ev(`({ attr: document.documentElement.getAttribute("data-theme"), stored: localStorage.getItem("noupload-theme"),
    ground: getComputedStyle(document.documentElement).getPropertyValue("--ground").trim().toUpperCase(), scheme: getComputedStyle(document.documentElement).colorScheme, label: document.getElementById("theme").textContent })`);

  /* ---------- A. Tema düğmesi: üç durum, kalıcılık, sayfalar ve diller arası ---------- */
  if (section("A")) {
    for (const sys of ["light", "dark"]) {
      const opp = sys === "light" ? "dark" : "light"; await os(sys);
      for (const l of LANGS) for (const p of PAGES) {
        const L = LABEL(l), tag = `A [sistem=${sys}] ${rel(l, p) || "(ana sayfa)"} ${l}`;
        await fresh(rel(l, p));
        let s = await state();
        check(`${tag} · ilk açılış sistemi izler`, [s.attr, s.stored, s.ground, s.label], [null, null, GROUND[sys], L[opp]]);
        await click("#theme"); s = await state();
        check(`${tag} · 1. tık → ${opp}`, [s.attr, s.stored, s.ground, s.scheme, s.label], [opp, opp, GROUND[opp], opp, L[sys]]);
        await reload(); s = await state();
        check(`${tag} · yenileyince korunur`, [s.attr, s.ground], [opp, GROUND[opp]]);
        // dil bağlantısına tıkla: öteki dildeki aynı sayfada da tema aynı
        const w = b.waitLoad(); await click(".barbtns a.langbtn"); await w;
        const o = LANGS.filter(x => x !== l)[0]; s = await state();                       // çubuktaki ilk dil bağlantısı
        check(`${tag} · dil bağlantısı aynı sayfanın ${o} adresine götürür, tema korunur`, [await ev(`location.pathname`), await ev(`document.documentElement.lang`), s.attr, s.label], [basePath + "/" + rel(o, p), o, opp, LABEL(o)[sys]]);
        await go(rel(l, p));
        await click("#theme"); s = await state();
        check(`${tag} · 2. tık → açıkça ${sys}`, [s.attr, s.stored, s.label], [sys, sys, L.system]);
        await click("#theme"); s = await state();
        check(`${tag} · 3. tık → sistem, kayıt silinir`, [s.attr, s.stored, s.label], [null, null, L[opp]]);
      }
    }
    await os("light");
    for (const l of LANGS) for (const p of PAGES) {
      await fresh(rel(l, p));
      const r = await ev(`(() => { const sc = document.querySelector("head > script:not([src])"), st = document.querySelector('head > link[rel="stylesheet"]'), st2 = document.querySelector("head > style");
        const css = x => { const c = getComputedStyle(x); return [c.fontSize, c.fontWeight, c.fontFamily, c.lineHeight, c.paddingTop, c.paddingLeft, c.borderRadius, c.borderTopWidth, c.borderTopColor, c.backgroundColor, c.color, c.textDecorationLine, c.cursor, Math.round(x.getBoundingClientRect().height * 10) / 10, Math.round(x.getBoundingClientRect().top * 10) / 10].join("|"); };
        const th = document.getElementById("theme"), lg = document.querySelector(".barbtns a.langbtn");
        return { before: !!(sc.compareDocumentPosition(st) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(sc.compareDocumentPosition(st2) & Node.DOCUMENT_POSITION_FOLLOWING), blocking: !sc.defer && !sc.async && sc.type !== "module",
          same: css(th) === css(lg), th: css(th), lg: css(lg), next: th.nextElementSibling === lg, tag: lg.tagName, noOldBtn: !document.getElementById("lang") }; })()`);
      check(`A ${rel(l, p) || "index"} ${l} · tema betiği CSS'ten önce, engelleyici`, [r.before, r.blocking], [true, true]);
      check(`A ${rel(l, p) || "index"} ${l} · dil değiştirici bir bağlantı; tema düğmesiyle aynı stil/boyut/hizada, yan yana`, [r.tag, r.noOldBtn, r.next, r.same ? "aynı" : r.th + "  ≠  " + r.lg], ["A", true, true, "aynı"]);
    }
    // Geri tuşu (bfcache): öteki sayfada değişen tema geri gelince uygulanır
    const first = LANGS[0], other = LANGS[1] || LANGS[0], tool = TOOLS[0];
    await fresh(rel(first, tool)); await ev(`window.__mark = 1`);
    { const w = b.waitLoad(); await ev(`location.href = ${JSON.stringify(b.base + "/" + rel(other, tool))}`); await w; await click("#theme"); const w2 = b.waitLoad(); await ev(`history.back()`); await Promise.race([w2, sleep(1500)]); await sleep(200); }
    check("A Geri tuşu: önbellekten gelen sayfa kayıtlı temayı uygular", await ev(`[window.__mark === 1, document.documentElement.getAttribute("data-theme"), document.getElementById("theme").textContent]`), [true, "dark", LABEL(first).light]);
  }

  /* ---------- B. Marka: mercan kare içinde "N" ---------- */
  if (section("B")) {
    const lum = c => { const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    const ratio = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const l of LANGS) for (const p of PAGES) for (const [sys, stored] of THEMES) {
      await os(sys); await fresh(rel(l, p), stored);
      const r = await ev(`(() => { ${VAR} const m = document.querySelector(".brand .mark"), n = document.querySelector(".brand .name"), cs = getComputedStyle(m);
        return { text: m.textContent, hidden: m.getAttribute("aria-hidden"), box: [Math.round(m.getBoundingClientRect().width), Math.round(m.getBoundingClientRect().height)], bg: cs.backgroundColor === cssVar("--brand"), fg: cs.color, bgc: cs.backgroundColor,
          fonts: [cs.fontFamily.split(",")[0].replace(/"/g, ""), getComputedStyle(n).fontFamily.split(",")[0].replace(/"/g, "")], name: n.textContent }; })()`);
      check(`B ${rel(l, p) || "index"} ${l} [sistem=${sys}, kayıt=${stored}] · 30px mercan kare, "N" ve marka adı Unbounded, harf kontrastı ≥ 4.5`, [r.text, r.hidden, r.box, r.bg, r.fonts, r.name, ratio(r.fg, r.bgc) >= 4.5], ["N", "true", [30, 30], true, ["Unbounded", "Unbounded"], "NoUpload", true]);
    }
    for (const p of PAGES) for (const sys of ["light", "dark"]) {
      await b.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: sys }] });
      await fresh(rel(config.xDefault, p));
      const r = await ev(`({ fg: getComputedStyle(document.querySelector(".brand .mark")).color, bg: getComputedStyle(document.querySelector(".brand .mark")).backgroundColor })`);
      check(`B ${rel(config.xDefault, p) || "index"} [kontrast teması, ${sys}] · marka karesi görünür (≥ 3:1)`, ratio(r.fg, r.bg) >= 3, true);
    }
    await os("light");
  }

  /* ---------- C. Dar ekran: taşma yok, kırıntı sınırı, çubuk zıplamıyor ---------- */
  if (section("C")) {
    await os("light");
    for (const l of LANGS) for (const p of PAGES) for (const w of [320, 340, 360, 380, 381, 421, 480, 481, 641, 721, 761, 821, 1021, 1200]) {     // kırılma noktalarının sıkışık yanları: 420 / 480 / 640 / 720 / 760 / 820 / 1020
      await size(w); await fresh(rel(l, p));
      const bad = [];
      for (let i = 0; i < 3; i++) {
        const r = await ev(`(() => { const cw = document.documentElement.clientWidth; const out = [...document.querySelectorAll(".bar, .bar *, .more, .more *, .tools, .tools *, .hero, .hero *, .why, .why *")].filter(n => { const q = n.getBoundingClientRect(); return q.width && (q.left < -0.5 || q.right > cw + 0.5); }).map(n => n.tagName + "." + n.className);
          return { over: document.documentElement.scrollWidth > cw, out, label: document.getElementById("theme").textContent }; })()`);
        if (r.over || r.out.length) bad.push(r);
        await click("#theme");
      }
      check(`C ${rel(l, p) || "index"} ${l} ${w}px · yatay taşma / kırpılma yok`, bad, []);
    }
    for (const l of LANGS) for (const p of TOOLS) {
      for (const [w, want] of [[320, "gizli"], [CRUMB_MAX[p], "gizli"], [CRUMB_MAX[p] + 1, "görünür"], [1200, "görünür"]]) {
        await mobile(w, 800); await fresh(rel(l, p));      // telefon öykünmesi: kaydırma çubuğu yer kaplamaz
        check(`C ${rel(l, p)} ${w}px · kırıntı ${want}`, await ev(`(() => { const s = document.querySelector(".brand small"); return [getComputedStyle(s).display === "none" ? "gizli" : "görünür", s.textContent]; })()`), [want, "/ " + p]);
      }
      await fresh(rel(l, p));
      const jumps = [], barH = []; let h1Moves = 0;
      for (let w = 280; w <= 560; w++) {
        await mobile(w, 800);
        const seen = [];
        for (let i = 0; i < 3; i++) { seen.push(await ev(`[Math.round(document.querySelector(".bar").getBoundingClientRect().height), Math.round(document.querySelector("h1").getBoundingClientRect().top)]`)); await click("#theme"); }
        if (new Set(seen.map(s => s[0])).size > 1) jumps.push(w);
        if (new Set(seen.map(s => s[1])).size > 1) h1Moves++;
        barH.push(seen[0][0]);
      }
      check(`C ${rel(l, p)} · 280–560px: tema yazısı değişince çubuk yüksekliği değişmiyor`, [jumps.slice(0, 5), h1Moves], [[], 0]);
      check(`C ${rel(l, p)} · ekran genişledikçe çubuk iki satıra geri dönmüyor`, barH.map((h, i) => i && h > barH[i - 1] ? 280 + i : 0).filter(Boolean), []);
    }
    await size(1200);
  }

  /* ---------- D. "← Araçlar", kartlar, "Diğer araçlar", alt not ---------- */
  if (section("D")) {
    await os("light"); await size(1200);
    // kartın görünümü: ana sayfadaki ile araç sayfalarındaki aynı olmalı (1.5px kenarlık 1x ekranda 1px olarak hesaplanır)
    const cardProbe = `(() => { const a = document.querySelector("a.tool"); const g = (n, ps, pseudo) => { const c = getComputedStyle(n, pseudo); return ps.map(p => c[p]).join("|"); };
      return { card: g(a, ["display", "textAlign", "paddingTop", "paddingLeft", "borderTopWidth", "borderTopStyle", "borderTopLeftRadius", "textDecorationLine", "minHeight", "transitionDuration"]),
        bar: g(a, ["height", "position"], "::before"), h3: g(a.querySelector("h3"), ["fontFamily", "fontSize", "fontWeight", "marginTop", "marginBottom"]), p: g(a.querySelector("p"), ["fontSize", "lineHeight"]) }; })()`;
    const cardsProbe = `(() => { ${VAR} return [...document.querySelectorAll("a.tool")].map(a => ({ href: a.getAttribute("href"), tool: a.dataset.tool, texts: [...a.querySelectorAll("h3, p")].map(n => n.textContent), tag: a.tagName,
      bar: Object.entries(${JSON.stringify(TOOL_COLOR)}).filter(([, v]) => cssVar(v) === getComputedStyle(a, "::before").backgroundColor).map(([k]) => k)[0] || "?" })); })()`;
    for (const l of LANGS) {
      const D = I18N[l];
      await fresh(rel(l, "index"));
      const indexCard = await ev(cardProbe);
      check(`D ${l} ana sayfa · kart stili: ortalı, 14px köşe, Unbounded 19px başlık, 13.5px açıklama, üstte 5px çubuk`, [indexCard.card.split("|").slice(1, 7).join("|"), indexCard.bar, indexCard.h3.split("|").slice(1, 3).join("|"), indexCard.h3.includes("Unbounded"), indexCard.p.split("|")[0]], ["center|27px|20px|1px|solid|14px", "5px|absolute", "19px|600", true, "13.5px"]);
      check(`D ${l} ana sayfa · bütün araç kartları gerçek <a>, sırası, metinleri, araç rengi; durum satırı`, [await ev(cardsProbe), await ev(`document.querySelector(".status").textContent.trim()`), await ev(`document.querySelectorAll(".more").length`)],
        [TOOLS.map(t => ({ href: t + ".html", tool: t, texts: card(l, t), tag: "A", bar: t })), D.index.status, 0]);
      for (let k = 0; k < TOOLS.length; k++) { await fresh(rel(l, "index")); const w = b.waitLoad(); await click(`a.tool:nth-child(${k + 1})`); await w; check(`D ${l} ana sayfa · ${k + 1}. kart → ${rel(l, TOOLS[k])}`, await ev(`[location.pathname, document.documentElement.lang]`), [basePath + "/" + rel(l, TOOLS[k]), l]); }
      for (const p of TOOLS) {
        const others = TOOLS.filter(t => t !== p);
        await fresh(rel(l, p));
        const r = await ev(`(() => { ${VAR} const a = document.querySelector(".bar a.back"), brand = document.querySelector(".bar a.brand"); const qa = a.getBoundingClientRect(), qb = brand.getBoundingClientRect();
          const sec = document.querySelector("section.more"), kids = [...document.querySelector(".wrap").children].filter(n => !n.hidden), note = document.querySelector(".localnote");
          return { back: [a.textContent, a.href, qa.right <= qb.left, Math.abs((qa.top + qa.bottom) / 2 - (qb.top + qb.bottom) / 2) < 3, !brand.contains(a), getComputedStyle(a).color === cssVar("--ink-3"), getComputedStyle(a).textDecorationLine], brand: brand.href,
            h2: sec.querySelector("h2").textContent, self: [...sec.querySelectorAll("a.tool")].some(c => c.pathname === location.pathname), lastThree: kids.slice(-3).map(n => n.tagName + "." + n.className), h1: document.querySelector("h1").textContent,
            note: note ? [note.textContent, getComputedStyle(note, "::before").backgroundColor === cssVar("--green"), note.offsetHeight > 0] : null, oldPrivacy: document.querySelectorAll(".privacy").length }; })()`);
        check(`D ${rel(l, p)} · "${D.common.back}" düz metin bağlantısı (ink-3), markanın solunda, o dilin ana sayfasına gider`, [r.back, r.brand], [[D.common.back, b.base + "/" + prefix(l), true, true, true, true, "none"], b.base + "/" + prefix(l)]);
        check(`D ${rel(l, p)} · alt not aracın altında, "${D.common.moreH}" ondan sonra, en sonda footer`, [r.note, r.oldPrivacy, r.h2, r.self, r.lastThree, r.h1], [[D.common.localNote, true, true], 0, D.common.moreH, false, ["P.localnote", "SECTION.more", "FOOTER."], D[p].title]);
        check(`D ${rel(l, p)} · "${D.common.moreH}": kendisi dışındaki araçlar, metinler, araç rengi`, await ev(cardsProbe), others.map(t => ({ href: t + ".html", tool: t, texts: card(l, t), tag: "A", bar: t })));
        check(`D ${rel(l, p)} · kart stili ana sayfayla birebir`, await ev(cardProbe), indexCard);
        { const w = b.waitLoad(); await click(".bar a.back"); await w; check(`D ${rel(l, p)} · ← tıklanınca ${l} ana sayfası`, await ev(`[location.pathname, document.title]`), [basePath + "/" + prefix(l), D.index.docTitle]); }
        for (let k = 0; k < others.length; k++) { await fresh(rel(l, p)); const w = b.waitLoad(); await click(`.more a.tool:nth-child(${k + 1})`); await w; check(`D ${rel(l, p)} · ${k + 1}. kart → ${rel(l, others[k])}`, await ev(`location.pathname`), basePath + "/" + rel(l, others[k])); }
        for (const [sys, stored] of THEMES) {
          await os(sys); await fresh(rel(l, p), stored);
          const c = await ev(`(() => { ${VAR} const a = document.querySelector("a.tool"), cs = getComputedStyle;
            return [cs(a).backgroundColor === cssVar("--surface"), cs(a).borderTopColor === cssVar("--rule"), cs(a.querySelector("h3")).color === cssVar("--ink"), cs(a.querySelector("p")).color === cssVar("--ink-2")]; })()`);
          check(`D ${rel(l, p)} [sistem=${sys}, kayıt=${stored}] · kart renkleri temayı izler`, c, [true, true, true, true]);
        }
        await os("light");
        for (const [w, cols] of [[1200, 2], [641, 2], [640, 1], [320, 1]]) { await size(w); await fresh(rel(l, p)); check(`D ${rel(l, p)} ${w}px · "Diğer araçlar" ${cols} sütun`, await ev(`getComputedStyle(document.querySelector(".more .tools")).gridTemplateColumns.split(" ").length`), cols); }
        await size(1200);
      }
      for (const [w, cols] of [[1200, 3], [761, 3], [760, 1], [360, 1]]) { await size(w); await fresh(rel(l, "index")); check(`D ${l} ana sayfa ${w}px · araç ızgarası ${cols} sütun`, await ev(`getComputedStyle(document.querySelector(".tools")).gridTemplateColumns.split(" ").length`), cols); }
      await size(1200);
    }
  }

  /* ---------- F. Tasarım sistemi ---------- */
  if (section("F")) {
    const hex = c => "#" + c.match(/[\d.]+/g).slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
    // renk token'ları: dört tema durumunda, her sayfada aynı
    for (const p of PAGES) for (const [sys, stored] of THEMES) {
      await os(sys); await size(1200); await fresh(rel(LANGS[0], p), stored);
      const want = TOKENS[stored || sys];
      const got = await ev(`(() => { ${VAR} return Object.fromEntries(${JSON.stringify(Object.keys(want))}.map(k => [k, cssVar("--" + k)])); })()`);
      check(`F ${rel(LANGS[0], p) || "index"} [sistem=${sys}, kayıt=${stored}] · renk token'ları`, Object.fromEntries(Object.entries(got).map(([k, v]) => [k, hex(v)])), want);
      check(`F ${rel(LANGS[0], p) || "index"} [sistem=${sys}, kayıt=${stored}] · tarayıcı çubuğunun rengi (theme-color) sayfanın zeminiyle aynı`, await ev(`[...new Set([...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.content.toUpperCase()))]`), [want.ground]);
    }
    await os("light");
    for (const l of LANGS) for (const p of PAGES) {
      const page = rel(l, p), isHome = p === "index";
      // yazı tipleri yerel dosyadan; h1 boyutları
      await size(1200); await fresh(page);
      const f = await ev(`(() => { const fam = s => getComputedStyle(document.querySelector(s)).fontFamily.split(",")[0].replace(/"/g, ""); return { h1: fam("h1"), body: fam("body"), chip: fam("#theme"), h1w: getComputedStyle(document.querySelector("h1")).fontWeight,
        loaded: [...new Set([...document.fonts].filter(x => x.status === "loaded").map(x => x.family.replace(/"/g, "")))].sort(), body2: [...document.fonts].filter(x => /Work Sans/.test(x.family)).map(x => x.status), files: performance.getEntriesByType("resource").map(e => e.name).filter(n => /\\.woff2?($|\\?)/.test(n)).map(n => new URL(n).origin === location.origin && /\\/assets\\/fonts\\//.test(n)) }; })()`);
      check(`F ${page || "index"} · başlık Unbounded 700, gövde ve chip Work Sans; yazı tipi dosyaları assets/fonts/ altından`, [f.h1, f.h1w, f.body, f.chip, f.loaded, f.files.length > 0 && f.files.every(Boolean)], ["Unbounded", "700", "Work Sans", "Work Sans", ["Unbounded", "Work Sans"], true]);
      // dosya adı ş/ğ/İ taşıyabilir: gövde yazı tipinin latin-ext alt kümesi de sayfa açılırken gelmiş olmalı (İngilizce sayfada metin bunu tetiklemez)
      check(`F ${page || "index"} · Work Sans'ın iki alt kümesi de (latin + latin-ext) açılışta yüklü`, f.body2, ["loaded", "loaded"]);
      const sizes = [];
      for (const w of [1200, 480, 479, 360]) { await size(w); await fresh(page); sizes.push(await ev(`getComputedStyle(document.querySelector("h1")).fontSize`)); }
      check(`F ${page || "index"} · h1: masaüstünde ${isHome ? 44 : 32}px, 480px'in altında 28px`, sizes, [isHome ? "44px" : "32px", isHome ? "44px" : "32px", "28px", "28px"]);

      // lekeler ve hareket
      await size(1200); await fresh(page);
      const m = await ev(`(() => { const an = document.getAnimations().map(a => ({ name: a.animationName || "geçiş", loop: a.effect.getComputedTiming().iterations === Infinity, el: a.effect.target.className }));
        return { blobs: [...document.querySelectorAll(".blob")].map(x => [getComputedStyle(x).animationName, getComputedStyle(x).position, x.closest("[aria-hidden]") !== null, parseFloat(getComputedStyle(x).filter.replace(/[^\\d.]/g, "")) > 20, +getComputedStyle(x).opacity < .3]), an }; })()`);
      check(`F ${page || "index"} · ${isHome ? "iki sabit bulanık leke; hareket eden yalnızca yeşil çizgi (bir kez) ve durum noktası (sürekli)" : "leke yok, animasyon yok"}`, [m.blobs, m.an.sort((x, y) => x.name.localeCompare(y.name))],
        isHome ? [[["none", "absolute", true, true, true], ["none", "absolute", true, true, true]], [{ name: "draw", loop: false, el: "stroke" }, { name: "pulse", loop: true, el: "pulse" }]] : [[], []]);
      if (isHome) check(`F ${page || "index"} · yeşil çizgi 240px, soldan çizilerek geliyor; durum noktası yeşil`, await ev(`(() => { ${VAR} const st = document.querySelector(".stroke"); const before = Math.round(st.getBoundingClientRect().width) < 240; document.getAnimations().find(x => x.animationName === "draw").finish(); return [st.offsetWidth, before && getComputedStyle(st).transformOrigin.startsWith("0px"), Math.round(st.getBoundingClientRect().width), getComputedStyle(document.querySelector(".stroke")).backgroundColor === cssVar("--green"), getComputedStyle(document.querySelector(".pulse")).backgroundColor === cssVar("--green"), getComputedStyle(document.querySelector(".proof")).color === cssVar("--green-text")]; })()`), [240, true, 240, true, true, true]);
      if (isHome) {
        // ana sayfanın yapısı: iki sütunlu giriş + şema kartı, "neden güvenebilirsiniz" karşılaştırması, lekelerin rengi ve yeri
        const T = I18N[l].index;
        const home = `(() => { ${VAR} const cs = (s, k) => { const n = document.querySelector(s); return n ? getComputedStyle(n)[k] : null; }, tx = s => { const n = document.querySelector(s); return n ? n.textContent : null; }, cols = s => (cs(s, "gridTemplateColumns") || "").split(" ").filter(Boolean).length;
          return { cols: [cols(".hero"), cols(".compare")], texts: [tx(".hero h1"), tx(".scheme .device-label"), tx(".noserver strong"), tx(".scheme figcaption"), tx(".why h2"), tx(".pill.them"), tx(".pill.us"), tx(".side.here .nonet")],
            scheme: [cs(".scheme", "borderTopWidth"), cs(".scheme", "borderTopStyle"), cs(".scheme", "borderTopColor") === cssVar("--ink"), cs(".scheme", "borderTopLeftRadius"), /0px 16px 30px/.test(cs(".scheme", "boxShadow") || ""), cs(".scheme", "backgroundColor") === cssVar("--surface"), cs(".scheme .device", "borderTopStyle")],
            why: [cs(".why h2", "fontSize"), (cs(".why h2", "fontFamily") || "").includes("Unbounded"), document.querySelectorAll(".compare > .side").length, cs(".pill.us", "backgroundColor") === cssVar("--blue"), cs(".pill.them", "color") === cssVar("--ink-3"), cs(".side.here .device", "borderTopStyle")],
            noserver: [cs(".noserver strong", "fontSize"), cs(".noserver strong", "fontWeight"), cs(".noserver strong", "color") === cssVar("--brand")],
            blobs: [...document.querySelectorAll(".blob")].map(x => [["--yellow", "--blue"].find(v => cssVar(v) === getComputedStyle(x).backgroundColor) || "?", x.getBoundingClientRect().left + x.getBoundingClientRect().width / 2 > innerWidth / 2]) }; })()`;
        check(`F ${page || "index"} · giriş iki sütun + şema kartı (2px ink, 20px köşe, gölge), "${T.whyH}" 24px Unbounded + iki kart, "sunucu yok" 19px/700 mercan, lekeler sarı ve mavi, sağda`, await ev(home),
          { cols: [2, 2], texts: [T.h, T.dgDevice, T.dgServer, T.dgNote, T.whyH, T.pillThem, T.pillUs, T.lblNoNet], scheme: ["2px", "solid", true, "20px", true, true, "dashed"], why: ["24px", true, 2, true, true, "dashed"], noserver: ["19px", "700", true], blobs: [["--yellow", true], ["--blue", true]] });
        const colsAt = [];
        for (const w of [821, 820, 721, 720]) { await size(w); await fresh(page); colsAt.push((await ev(home)).cols); }
        check(`F ${page || "index"} · giriş 820px'in, karşılaştırma 720px'in altında alt alta; dar iki sütunda da (900px) h1 44px`, [colsAt, await (async () => { await size(900); await fresh(page); return ev(`getComputedStyle(document.querySelector("h1")).fontSize`); })()], [[[2, 2], [1, 2], [1, 2], [1, 1]], "44px"]);
        // şema: akıştaki simgeler kesik çizgili kutunun içinde kalır, "sunucu yok" kutuyla üst üste binmez (dar sütunda alta iner)
        const schemeBad = [];
        for (const w of [320, 345, 430, 821, 900]) { await size(w); await fresh(page);
          const r = await ev(`(() => { const d = document.querySelector(".scheme .device").getBoundingClientRect(), n = document.querySelector(".scheme .noserver").getBoundingClientRect();
            const out = [...document.querySelectorAll(".scheme .device .flow > *")].filter(x => { const q = x.getBoundingClientRect(); return q.left < d.left - .5 || q.right > d.right + .5; }).length;
            const overlap = !(n.left >= d.right - .5 || n.top >= d.bottom - .5 || n.right <= d.left + .5 || n.bottom <= d.top + .5); return [out, overlap]; })()`);
          if (r[0] || r[1]) schemeBad.push([w, ...r]); }
        check(`F ${page || "index"} · şema 320–900px: simgeler "${T.dgDevice}" kutusunun içinde, "${T.dgServer}" kutuya binmiyor`, schemeBad, []);
        await size(1200);
      }
      await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }] });
      await fresh(page);
      check(`F ${page || "index"} · azaltılmış hareket: hiçbir animasyon ve geçiş yok`, await ev(`[document.getAnimations().length, getComputedStyle(document.querySelector("a.tool")).transitionDuration, getComputedStyle(document.querySelector("a.tool p")).transitionDuration, getComputedStyle(document.querySelector("a.tool"), "::before").transitionDuration]`), [0, "0s", "0s", "0s"]);
      await os("light");

      // kartlar: fareyle eğik + açıklama kapalı, üstüne gelince/odaklanınca açılır; dokunmatikte düz ve açıklama hep açık
      await size(1200); await fresh(page);
      const tilt = `[...document.querySelectorAll("a.tool")].map(a => { const t = getComputedStyle(a).transform; if (t === "none") return 0; const v = t.match(/-?[\\d.]+/g).map(Number); return Math.round(Math.atan2(v[1], v[0]) * 1800 / Math.PI) / 10; })`;
      const open = `[...document.querySelectorAll("a.tool p")].map(x => x.offsetHeight > 0 && +getComputedStyle(x).opacity > 0)`;
      const n = isHome ? TOOLS.length : TOOLS.length - 1;
      check(`F ${page || "index"} · fare: kartlar eğik (-1.1° / 0.8° / -0.6°), açıklamalar kapalı`, [await ev(tilt), await ev(open)], [[-1.1, 0.8, -0.6].slice(0, n), Array(n).fill(false)]);
      // kartın "kalkmış" hâli: [düz, 6px yukarıda, çubuk 9px, açıklama yer kaplıyor, opak, gölge büyümüş]
      const lift = `(() => { const a = document.querySelector("a.tool"), cs = getComputedStyle(a), p = a.querySelector("p"), t = cs.transform === "none" ? [1, 0, 0, 1, 0, 0] : cs.transform.match(/-?[\\d.]+/g).map(Number); return [Math.abs(t[1]) < .001, Math.round(t[5]), getComputedStyle(a, "::before").height, p.offsetHeight > 0, getComputedStyle(p).opacity, /0px 18px 34px/.test(cs.boxShadow)]; })()`;
      { const q = await ev(`(() => { const a = document.querySelector("a.tool"); a.scrollIntoView({ block: "center" }); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
        await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q[0], y: q[1] }); await sleep(450);
        check(`F ${page || "index"} · fareyle üstüne gelince kart düzelir, yükselir, gölge büyür, çubuk 9px olur, açıklama görünür`, [await ev(`document.querySelector("a.tool").matches(":hover")`), await ev(lift)], [true, [true, -6, "9px", true, "1", true]]);
        await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 }); await sleep(100); }      // fareyi çek: sonraki sayfada geçiş başlamasın
      // açılan açıklama kartı büyütüp altındaki içeriği itmemeli: sütunların en dar olduğu genişlikler
      { const moved = [];
        for (const w of isHome ? [761, 900, 1000] : [641, 660, 900]) {
          await size(w, 900); await fresh(page);
          for (let i = 0; i < n; i++) {
            await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 }); await sleep(320);
            const q = await ev(`(() => { const a = document.querySelectorAll("a.tool")[${i}]; a.scrollIntoView({ block: "center" }); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, document.querySelector("footer").getBoundingClientRect().top + scrollY]; })()`);
            await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q[0], y: q[1] }); await sleep(400);
            const after = await ev(`(() => { const a = document.querySelectorAll("a.tool")[${i}], p = a.querySelector("p"); return [a.matches(":hover"), p.scrollHeight - p.offsetHeight, document.querySelector("footer").getBoundingClientRect().top + scrollY]; })()`);
            if (!after[0] || after[1] > 0 || Math.abs(after[2] - q[2]) > .5) moved.push([w, i, after[0] ? "" : "hover yok", "kırpılan " + after[1], "kayma " + Math.round((after[2] - q[2]) * 10) / 10]);
          }
        }
        await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 }); await size(1200);
        check(`F ${page || "index"} · fareyle kartın üstüne gelince açıklama kırpılmadan açılıyor, alttaki içerik kaymıyor (dar sütunlar)`, moved, []); }
      await ev(`document.querySelector("a.tool").focus()`);
      await b.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Shift" }); await b.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Shift" });     // klavye kipine geç (focus-visible)
      await ev(`(document.querySelector("a.tool").blur(), document.querySelector("a.tool").focus())`); await sleep(450);
      check(`F ${page || "index"} · klavyeyle odaklanınca kart düzelir, yükselir, çubuk 9px olur, açıklama açılır, odak halkası var`, await ev(`(() => { const a = document.querySelector("a.tool"), cs = getComputedStyle(a), t = cs.transform.match(/-?[\\d.]+/g).map(Number); return [Math.abs(t[1]) < .001, Math.round(t[5]), getComputedStyle(a, "::before").height, getComputedStyle(a.querySelector("p")).maxHeight !== "0px", cs.outlineStyle, cs.outlineWidth]; })()`).then(async r => [r, await ev(lift)]), [[true, -6, "9px", true, "solid", "3px"], [true, -6, "9px", true, "1", true]]);
      await mobile(360, 800); await b.touch(true); await fresh(page);
      check(`F ${page || "index"} · dokunmatik: eğiklik yok, açıklamalar hep görünür, 360px'te taşma yok`, [await ev(tilt), await ev(open), await ev(`document.documentElement.scrollWidth > document.documentElement.clientWidth`)], [Array(n).fill(0), Array(n).fill(true), false]);
      { await mobile(768, 1024); await fresh(page);
        check(`F ${page || "index"} · dokunmatik tablet (768px): aynı satırdaki kartlar eşit boyda`, await ev(`[...new Set([...document.querySelectorAll("a.tool")].map(a => Math.round(a.getBoundingClientRect().height)))].length`), 1);
        await mobile(360, 800); await fresh(page); }
      check(`F ${page || "index"} · dokunmatik: üst çubuktaki hedefler (chip'ler, "← Araçlar", marka) en az 40px yüksek`, await ev(`[...document.querySelectorAll(".bar .langbtn, .bar .back, .bar .brand")].filter(x => x.getBoundingClientRect().height < 40).map(x => x.className + " " + x.getBoundingClientRect().height)`), []);
      await b.touch(false);
    }
    // araç sayfası bileşenleri
    for (const p of TOOLS) {
      await size(1200); await fresh(rel(LANGS[0], p));
      const r = await ev(`(() => { ${VAR} const cs = (s, k) => { const n = document.querySelector(s); return n ? getComputedStyle(n)[k] : null; }; const drop = document.querySelector(".drop, #drop, .pick");
        const primary = [...document.querySelectorAll("button:not(.ghost):not(.langbtn):not(.tab)")].find(x => !x.closest(".ctl"));
        return { drop: [getComputedStyle(drop).borderTopStyle, getComputedStyle(drop).borderTopWidth, getComputedStyle(drop).borderTopLeftRadius, getComputedStyle(drop).borderTopColor === cssVar("--dash")],
          primary: [getComputedStyle(primary).backgroundColor === cssVar("--blue"), getComputedStyle(primary).color === cssVar("--on-blue")],
          tabs: document.querySelector(".tab") ? [cs('.tab[aria-selected="true"]', "backgroundColor") === cssVar("--yellow"), cs('.tab[aria-selected="true"]', "color") === cssVar("--on-yellow"), cs('.tab[aria-selected="false"]', "backgroundColor") === cssVar("--surface"), cs('.tab[aria-selected="false"]', "borderTopColor") === cssVar("--rule"), parseFloat(cs(".tab", "borderTopLeftRadius")) > 100, cs(".tab", "fontFamily").includes("Unbounded")] : null }; })()`);
      check(`F ${p}.html · bırakma alanı 2px kesik çizgi 16px köşe; birincil düğme mavi${p === "pdf" ? "; sekmeler hap, seçili olan sarı" : ""}`, r, { drop: ["dashed", "2px", "16px", true], primary: [true, true], tabs: p === "pdf" ? [true, true, true, true, true, true] : null });
    }
    // küçük metinlerde kontrast (≥ 4.5:1; büyük metin ≥ 3:1) — her sayfa, iki tema, dokunmatik görünüm (açıklamalar açık)
    await b.touch(true);
    // koyu renkler iki ayrı blokta durduğu için ikisi de denetlenir: kayıtlı "dark" (data-theme) ve sistem koyu (prefers-color-scheme)
    for (const l of LANGS) for (const p of PAGES) for (const [sys, stored] of [["light", "light"], ["light", "dark"], ["dark", null]]) {
      await os(sys); await mobile(360, 800); await fresh(rel(l, p), stored);
      check(`F ${rel(l, p) || "index"} [sistem=${sys}, kayıt=${stored}] · metin kontrastı`, await ev(CONTRAST_AUDIT), []);
    }
    await os("light");
    await b.touch(false); await size(1200);
  }

  /* ---------- E. Ekran görüntüleri ---------- */
  if (section("E")) {
    for (const l of LANGS) for (const p of PAGES) {
      const n = `${l}-${p}`;
      await os("light"); await size(1200); await fresh(rel(l, p)); await b.fullShot(path.join(SHOTS, `${n}-1200-acik.png`), 1200);
      await fresh(rel(l, p), "dark"); await b.fullShot(path.join(SHOTS, `${n}-1200-koyu.png`), 1200);
      await mobile(360, 800); await fresh(rel(l, p), "dark"); const h = await ev("document.documentElement.scrollHeight"); await mobile(360, Math.min(h, 4000)); await sleep(100); await b.shot(path.join(SHOTS, `${n}-360-koyu.png`));
    }
  }

  await finish(b);
})().catch(crash);
