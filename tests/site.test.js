/* ==================================================================
   Site geneli — her dil × her sayfa:
     A  tema düğmesi: üç durum, kalıcılık, dil bağlantısıyla öteki dile geçiş, "Geri" önbelleği
     B  marka ikonu: çizgi rengi ve kontrast, Windows kontrast teması
     C  dar ekran: yatay taşma yok, kırıntı sınırı, üst çubuk zıplamıyor
     D  "← Araçlar", araç kartları, "Diğer araçlar"
     E  ekran görüntüleri (tests/.tmp/shots)
   Tek bölüm: node tests/site.test.js C
================================================================== */
"use strict";
const fs = require("fs"), path = require("path");
const { launch, reporter, ROOT, TMP, config, prefix, fileOf, rel, i18n } = require("./harness.js");
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
const card = (l, t) => [I18N[l].common.tools[t].title, I18N[l].common.tools[t].desc, I18N[l].common.open];
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

  /* ---------- B. Marka ikonu + Windows kontrast teması ---------- */
  if (section("B")) {
    const lum = c => { const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    const ratio = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const l of LANGS) for (const p of PAGES) for (const [sys, stored] of [["light", null], ["dark", null], ["light", "dark"], ["dark", "light"]]) {
      await os(sys); await fresh(rel(l, p), stored);
      const r = await ev(`(() => { const svg = document.querySelector(".brand .mark svg"); const i = document.createElement("i"); i.style.color = "var(--accent-ink)"; document.body.append(i); const want = getComputedStyle(i).color; i.remove();
        return { attr: svg.getAttribute("stroke"), ok: getComputedStyle(svg.querySelector("path")).stroke === want, stroke: getComputedStyle(svg.querySelector("path")).stroke, bg: getComputedStyle(document.querySelector(".brand .mark")).backgroundColor }; })()`);
      check(`B ${rel(l, p) || "index"} ${l} [sistem=${sys}, kayıt=${stored}] · ikon çizgisi --accent-ink, kontrast ≥ 4.5`, [r.attr, r.ok, ratio(r.stroke, r.bg) >= 4.5], ["var(--accent-ink)", true, true]);
    }
    for (const p of PAGES) for (const sys of ["light", "dark"]) {
      await b.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }, { name: "prefers-color-scheme", value: sys }] });
      await fresh(rel(config.xDefault, p));
      const r = await ev(`({ stroke: getComputedStyle(document.querySelector(".brand .mark svg path")).stroke, bg: getComputedStyle(document.querySelector(".brand .mark")).backgroundColor })`);
      check(`B ${rel(config.xDefault, p) || "index"} [kontrast teması, ${sys}] · ikon görünür (≥ 3:1)`, ratio(r.stroke, r.bg) >= 3, true);
    }
    await os("light");
  }

  /* ---------- C. Dar ekran: taşma yok, kırıntı sınırı, çubuk zıplamıyor ---------- */
  if (section("C")) {
    await os("light");
    for (const l of LANGS) for (const p of PAGES) for (const w of [320, 340, 360, 380, 381, 430, 431, 480, 500, 501, 768, 1200]) {
      await size(w); await fresh(rel(l, p));
      const bad = [];
      for (let i = 0; i < 3; i++) {
        const r = await ev(`(() => { const cw = document.documentElement.clientWidth; const out = [...document.querySelectorAll(".bar, .bar *, .more, .more *, .tools, .tools *")].filter(n => { const q = n.getBoundingClientRect(); return q.width && (q.left < -0.5 || q.right > cw + 0.5); }).map(n => n.tagName + "." + n.className);
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

  /* ---------- D. "← Araçlar", kartlar, "Diğer araçlar" ---------- */
  if (section("D")) {
    await os("light"); await size(1200);
    const cardProbe = `(() => { const a = document.querySelector("a.tool"); const g = (n, ps) => { const c = getComputedStyle(n); return ps.map(p => c[p]).join("|"); };
      return { card: g(a, ["display", "columnGap", "rowGap", "alignItems", "paddingTop", "paddingLeft", "borderTopWidth", "borderTopStyle", "textDecorationLine", "transitionProperty", "transitionDuration"]),
        ico: g(a.querySelector(".ico"), ["width", "height", "borderTopLeftRadius", "display"]), svg: g(a.querySelector(".ico svg"), ["width", "height", "strokeWidth", "fill"]),
        h3: g(a.querySelector("h3"), ["fontSize", "fontWeight", "marginTop", "marginBottom"]), p: g(a.querySelector("p"), ["fontSize", "marginTop", "marginBottom"]), go: g(a.querySelector(".go"), ["display", "marginTop", "fontFamily", "fontSize"]) }; })()`;
    for (const l of LANGS) {
      const D = I18N[l];
      await fresh(rel(l, "index"));
      const indexCard = await ev(cardProbe);
      check(`D ${l} ana sayfa · bütün araç kartları, sırası, metinleri, araç sayısı`, await ev(`[[...document.querySelectorAll("a.tool")].map(a => a.getAttribute("href")), [...document.querySelectorAll("a.tool")].map(a => [...a.querySelectorAll("h3, p, .go")].map(n => n.textContent)), document.querySelector(".section-head span").textContent, document.querySelectorAll(".more").length]`),
        [TOOLS.map(t => t + ".html"), TOOLS.map(t => card(l, t)), D.index.toolsN.replace("{toolCount}", TOOLS.length), 0]);
      for (let k = 0; k < TOOLS.length; k++) { await fresh(rel(l, "index")); const w = b.waitLoad(); await click(`a.tool:nth-child(${k + 1})`); await w; check(`D ${l} ana sayfa · ${k + 1}. kart → ${rel(l, TOOLS[k])}`, await ev(`[location.pathname, document.documentElement.lang]`), [basePath + "/" + rel(l, TOOLS[k]), l]); }
      for (const p of TOOLS) {
        const others = TOOLS.filter(t => t !== p);
        await fresh(rel(l, p));
        const r = await ev(`(() => { const a = document.querySelector(".bar a.back"), brand = document.querySelector(".bar a.brand"), name = brand.querySelector("span:not(.mark)"); const qa = a.getBoundingClientRect(), qb = brand.getBoundingClientRect();
          const sec = document.querySelector("section.more"), cards = [...sec.querySelectorAll("a.tool")], kids = [...document.querySelector(".wrap").children].filter(n => !n.hidden);
          return { back: [a.textContent, a.href, qa.right <= qb.left, Math.abs((qa.top + qa.bottom) / 2 - (qb.top + qb.bottom) / 2) < 3, !brand.contains(a)], brand: [name.textContent, brand.href],
            h2: sec.querySelector("h2").textContent, hrefs: cards.map(c => c.getAttribute("href")), texts: cards.map(c => [...c.querySelectorAll("h3, p, .go")].map(n => n.textContent)),
            self: cards.some(c => c.pathname === location.pathname), lastTwo: kids.slice(-2).map(n => n.tagName + "." + n.className), h1: document.querySelector("h1").textContent }; })()`);
        check(`D ${rel(l, p)} · "${D.common.back}" markanın solunda, o dilin ana sayfasına gider`, [r.back, r.brand], [[D.common.back, b.base + "/" + prefix(l), true, true, true], ["NoUpload", b.base + "/" + prefix(l)]]);
        check(`D ${rel(l, p)} · "${D.common.moreH}": kendisi dışındaki araçlar, metinler, yer`, [r.h2, r.hrefs, r.texts, r.self, r.lastTwo, r.h1], [D.common.moreH, others.map(t => t + ".html"), others.map(t => card(l, t)), false, ["SECTION.more", "FOOTER."], D[p].title]);
        check(`D ${rel(l, p)} · kart stili ana sayfayla birebir`, await ev(cardProbe), indexCard);
        { const w = b.waitLoad(); await click(".bar a.back"); await w; check(`D ${rel(l, p)} · ← tıklanınca ${l} ana sayfası`, await ev(`[location.pathname, document.title]`), [basePath + "/" + prefix(l), D.index.docTitle]); }
        for (let k = 0; k < others.length; k++) { await fresh(rel(l, p)); const w = b.waitLoad(); await click(`.more a.tool:nth-child(${k + 1})`); await w; check(`D ${rel(l, p)} · ${k + 1}. kart → ${rel(l, others[k])}`, await ev(`location.pathname`), basePath + "/" + rel(l, others[k])); }
        for (const [sys, stored] of [["light", null], ["dark", null], ["light", "dark"], ["dark", "light"]]) {
          await os(sys); await fresh(rel(l, p), stored);
          const c = await ev(`(() => { const v = n => { const i = document.createElement("i"); i.style.color = "var(" + n + ")"; document.body.append(i); const x = getComputedStyle(i).color; i.remove(); return x; }; const a = document.querySelector("a.tool"), cs = getComputedStyle;
            return [cs(a).backgroundColor === v("--surface"), cs(a).borderTopColor === v("--rule"), cs(a.querySelector(".ico")).backgroundColor === v("--accent-soft"), cs(a.querySelector(".ico svg")).stroke === v("--accent"), cs(a.querySelector("p")).color === v("--ink-2"), cs(a.querySelector(".go")).color === v("--accent")]; })()`);
          check(`D ${rel(l, p)} [sistem=${sys}, kayıt=${stored}] · kart renkleri temayı izler`, c, [true, true, true, true, true, true]);
        }
        await os("light");
        for (const [w, cols] of [[1200, 2], [641, 2], [640, 1], [320, 1]]) { await size(w); await fresh(rel(l, p)); check(`D ${rel(l, p)} ${w}px · ızgara ${cols} sütun`, await ev(`getComputedStyle(document.querySelector(".more .tools")).gridTemplateColumns.split(" ").length`), cols); }
        await size(1200);
      }
    }
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
