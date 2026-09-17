/* ==================================================================
   Test düzeneği — başsız Chrome (ya da Edge) + yerel statik sunucu.
   Sıfır bağımlılık: Node 22+ (yerleşik WebSocket ve fetch) ve kurulu bir
   Chrome/Edge yeter. Tarayıcı Chrome DevTools Protocol (CDP) ile sürülür.

   Yerel sunucu yayını taklit eder: site, build.js'teki SITE adresinin
   yolunda sunulur (…/noupload/), klasör adresleri index.html verir,
   "/en" → "/en/" yönlendirilir, dosya türleri doğru gönderilir.
   Portlar rastgele, tarayıcı profili çalıştırmaya özeldir: birden çok
   test aynı anda koşabilir.
================================================================== */
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const { spawn, execFileSync } = require("child_process");

if (typeof WebSocket === "undefined" || typeof fetch === "undefined") {
  console.error("HATA: testler Node 22 ya da üstünü ister (yerleşik WebSocket ve fetch). Bu sürüm: " + process.version);
  process.exit(2);
}

const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(__dirname, ".tmp");                 // fotoğraf/PDF örnekleri, ekran görüntüleri, geçici kopyalar (.gitignore'da)
const FX = path.join(TMP, "fixtures");
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- site ayarları: build.js'ten ---------- */
const config = JSON.parse(execFileSync(process.execPath, ["build.js", "--print-config"], { cwd: ROOT, encoding: "utf8" }));
const BASE_PATH = new URL(config.site).pathname;          // "/noupload/"
const prefix = lang => lang === config.defaultLang ? "" : lang + "/";
const fileOf = page => page === "index" ? "" : page + ".html";
const rel = (lang, page) => prefix(lang) + fileOf(page);  // b.go() için: "en/pdf.html", ana sayfa için "" ya da "en/"
const absUrl = (lang, page) => config.site + rel(lang, page);
const i18n = lang => JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", lang + ".json"), "utf8").replace(/^﻿/, ""));
// i18n metnini testte doldurmak için: fill("{n} dosya", {n: 3}); çoğul nesnesinde n'ye göre seçer (tr ve en için yeterli)
const fill = (text, vars = {}) => (typeof text === "string" ? text : (Number(vars.n) === 1 && text.one ? text.one : text.other))
  .replace(/\{(\w+)\}/g, (whole, name) => name in vars ? vars[name] : whole);

/* ---------- tarayıcıyı bul ---------- */
function findBrowser() {
  if (process.env.CHROME_PATH) {
    if (fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error("CHROME_PATH bulunamadı: " + process.env.CHROME_PATH);
  }
  const env = process.env, candidates = [];
  if (process.platform === "win32") {
    for (const base of [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean)) {
      candidates.push(path.join(base, "Google/Chrome/Application/chrome.exe"), path.join(base, "Microsoft/Edge/Application/msedge.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Chromium.app/Contents/MacOS/Chromium");
  } else {
    for (const dir of (env.PATH || "").split(path.delimiter)) for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) candidates.push(path.join(dir, name));
  }
  const found = candidates.find(c => fs.existsSync(c));
  if (!found) throw new Error("Chrome ya da Edge bulunamadı. Yolunu CHROME_PATH ortam değişkeniyle ver.");
  return found;
}

/* ---------- yerel sunucu + tarayıcı ---------- */
const MIME = { ".woff2": "font/woff2", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".map": "application/json", ".md": "text/markdown; charset=utf-8" };

// root: sunulacak depo kopyası (varsayılan: bu depo). extraMounts: [["/baska/", "klasör"], …]
async function launch({ root = ROOT, extraMounts = [] } = {}) {
  const mounts = [[BASE_PATH, root], ...extraMounts];
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }
    const m = mounts.find(([pre]) => p.startsWith(pre) || p + "/" === pre);
    if (!m) { res.writeHead(404); return res.end("yok"); }
    if (p + "/" === m[0]) { res.writeHead(301, { location: m[0] }); return res.end(); }
    let f = path.normalize(path.join(m[1], p.slice(m[0].length)));
    if (!f.startsWith(path.normalize(m[1]))) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!p.endsWith("/")) { res.writeHead(301, { location: p + "/" }); return res.end(); }        // GitHub Pages gibi
      f = path.join(f, "index.html");
    }
    fs.readFile(f, (e, body) => {
      if (e) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("404"); }
      // no-cache: her seferinde taze dosya. (no-store olsaydı Chrome sayfayı "Geri" önbelleğine almaz, o testler yanlış alarm verirdi.)
      res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
      res.end(body);
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`, base = origin + BASE_PATH.replace(/\/$/, "");

  fs.mkdirSync(TMP, { recursive: true });
  const profile = fs.mkdtempSync(path.join(TMP, "profile-"));
  const chrome = spawn(findBrowser(), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=1200,800", "about:blank"], { stdio: "ignore" });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0].trim(); } catch (e) { await sleep(150); }
  }
  if (!port) { chrome.kill(); server.close(); throw new Error("Tarayıcı açılamadı."); }
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some(t => t.type === "page")) break; } catch (e) {}
    await sleep(150);
  }
  const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r));

  let id = 0; const pending = new Map(), waiters = [], problems = [], requests = [];
  ws.addEventListener("message", m => {
    const d = JSON.parse(m.data);
    if (d.id) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return; }
    if (d.method === "Network.requestWillBeSent") requests.push(d.params.request.url);
    if (d.method === "Runtime.exceptionThrown") problems.push("exception: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === "Log.entryAdded" && d.params.entry.level === "error") problems.push("log: " + d.params.entry.text + " " + (d.params.entry.url || ""));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") problems.push("console.error: " + d.params.args.map(a => a.value ?? a.description).join(" "));
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === d.method) { waiters[i].res(d.params); waiters.splice(i, 1); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const waitFor = method => new Promise(res => waiters.push({ method, res }));
  // sayfada JS çalıştırır, değerini döndürür (Promise ise bekler). Sayfanın üst düzey const'ları (STR, items…) erişilebilir.
  const ev = async expression => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(expression.slice(0, 200) + " -> " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  // Yazı tipleri sonradan yüklenir (font-display: swap) ve genişlikleri değiştirir: ölçümden önce hazır olmaları beklenir.
  const settle = async () => { await sleep(80); await ev("document.fonts ? document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => r(1)))) : 1").catch(() => {}); await sleep(40); };
  const navigate = async url => { const w = waitFor("Page.loadEventFired"); await send("Page.navigate", { url }); await w; await settle(); };
  const go = page => navigate(`${base}/${page}`);                                   // siteye göreli: go("en/pdf.html"), go("")
  const reload = async () => { const w = waitFor("Page.loadEventFired"); await send("Page.reload", { ignoreCache: true }); await w; await settle(); };
  const waitLoad = async () => { await waitFor("Page.loadEventFired"); await settle(); };
  const os = scheme => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });   // işletim sisteminin tema tercihi
  const size = (width, height = 800) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });   // masaüstü: kaydırma çubuğu yer kaplar
  const mobile = (width, height = 800) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });  // telefon: kaplamaz
  // dokunmatik cihaz: (hover: none) ve (pointer: coarse) olur — başsız Chrome aksi hâlde hep "fare var" der
  const touch = on => send("Emulation.setTouchEmulationEnabled", { enabled: on, maxTouchPoints: on ? 5 : 1 });
  const offline = on => send("Network.emulateNetworkConditions", { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const shot = async (file, opts = {}) => {
    const r = await send("Page.captureScreenshot", { format: "png", ...opts });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  };
  const fullShot = async (file, width) => {
    const h = await ev("document.documentElement.scrollHeight");
    await size(width, Math.min(h, 4000)); await sleep(80); await shot(file); await size(width, 800);
  };
  const click = sel => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
  // <input type=file>'a diskten dosya seçtirir (gerçek seçim gibi "change" olayı doğar)
  const setFiles = async (selector, files) => {
    const { root: doc } = await send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await send("DOM.querySelector", { nodeId: doc.nodeId, selector });
    await send("DOM.setFileInputFiles", { nodeId, files });
  };
  const waitUntil = async (expression, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev(expression)) return true; await sleep(40); }
    throw new Error("zaman aşımı: " + expression.slice(0, 120));
  };
  const close = async () => {
    try { ws.close(); } catch (e) {}
    chrome.kill(); server.close();
    for (let i = 0; i < 10; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch (e) { await sleep(200); } }
  };
  // siteye ait olmayan istekler (blob:, data: ve about:blank sayılmaz). allow: izin verilen adres başlangıçları
  const externalRequests = (allow = [origin]) => [...new Set(requests)].filter(u => !allow.some(a => u.startsWith(a)) && !/^(blob:|data:|about:blank$)/.test(u));

  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable"); await send("DOM.enable");
  await size(1200, 800);
  return { base, origin, send, ev, navigate, go, reload, waitLoad, os, size, mobile, touch, offline, shot, fullShot, click, setFiles, waitUntil, requests, problems, externalRequests, close, sleep };
}

/* ---------- kontrast denetimi ---------- */
// Sayfada çalışır (b.ev(CONTRAST_AUDIT)): görünen her metnin rengini, arkasındaki zeminle (yarı saydam katmanlar
// üst üste bindirilerek) karşılaştırır ve WCAG eşiğinin altında kalanları döndürür: küçük metin 4.5:1,
// büyük metin (24px ya da 18.66px kalın) 3:1. Basılamaz (disabled) denetimler ve gizli öğeler sayılmaz.
const CONTRAST_AUDIT = `(() => {
  const parse = c => { const n = (c.match(/-?[\\d.]+(e-?\\d+)?/g) || []).map(Number); return c.startsWith("color(") ? { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n.length > 3 ? n[3] : 1 } : { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = el => { const layers = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let base = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : { r: 255, g: 255, b: 255, a: 1 }; while (layers.length) base = over(layers.pop(), base); return base; };
  const shown = el => { for (let n = el; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0 || s.maxHeight === "0px") return false; } const q = el.getBoundingClientRect(); return q.width > 1 && q.height > 1 && !/inset\\(50%\\)/.test(getComputedStyle(el).clipPath); };
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && shown(el) && !el.closest(":disabled")) {
      const s = getComputedStyle(el), size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
      let op = 1; for (let n = el; n; n = n.parentElement) op *= +getComputedStyle(n).opacity;      // opacity ile soldurulmuş yazı da zemine karışır
      const bg = bgOf(el), ink = parse(s.color), fg = over({ ...ink, a: ink.a * op }, bg), hi = Math.max(lum(fg), lum(bg)), lo = Math.min(lum(fg), lum(bg)), ratio = (hi + .05) / (lo + .05);
      if (ratio < (large ? 3 : 4.5)) bad.push(el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : "") + " “" + el.textContent.trim().slice(0, 24) + "” " + size + "px " + ratio.toFixed(2) + ":1");
    }
  }
  return bad;
})()`;

/* ---------- sonuç defteri ---------- */
// const t = reporter(); t.check("ad", bulunan, beklenen);  … sonunda await t.finish(b)
// beklenen bir işlevse (got => doğru/yanlış) onunla sınanır, değilse JSON olarak karşılaştırılır.
function reporter() {
  const lines = []; let failed = 0;
  const check = (name, got, want) => {
    const ok = typeof want === "function" ? !!want(got) : JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    lines.push(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        bulunan  = ${JSON.stringify(got)}${typeof want === "function" ? "" : `\n        beklenen = ${JSON.stringify(want)}`}`}`);
  };
  const info = text => lines.push("BİLGİ " + text);
  // b verilirse: konsol hataları ve site dışı istekler de başarısızlık sayılır. ignore: beklenen konsol kayıtları (RegExp)
  const finish = async (b, { ignore, allow } = {}) => {
    let extra = 0;
    if (b) {
      const probs = [...new Set(b.problems)].filter(p => !(ignore && ignore.test(p)));
      const ext = b.externalRequests(allow);
      for (const p of probs) { lines.push("FAIL  konsol: " + p.slice(0, 400)); extra++; }
      for (const u of ext) { lines.push("FAIL  site dışına istek: " + u); extra++; }
      await b.close();
    }
    console.log(lines.join("\n"));
    console.log(`\n${lines.filter(l => l.startsWith("PASS")).length} geçti, ${failed + extra} kaldı`);
    setTimeout(() => process.exit(failed + extra ? 1 : 0), 200);
  };
  const crash = e => { console.log(lines.join("\n")); console.error("HATA:", e); process.exit(2); };
  return { check, info, finish, crash };
}

// Deponun geçici bir kopyası (build.js denemeleri için). .git, node_modules ve testlerin geçici klasörü kopyalanmaz.
// (fs.cpSync bir klasörü kendi alt klasörüne kopyalamayı reddediyor; kopya tests/.tmp altında durduğu için elle geziliyor.)
function copyRepo(dest, { withLib = true } = {}) {
  const skip = r => r === ".git" || r === "node_modules" || r === "tests/.tmp" || (!withLib && r.startsWith("lib/") && r.endsWith(".js"));
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  (function walk(relDir) {
    for (const e of fs.readdirSync(path.join(ROOT, relDir), { withFileTypes: true })) {
      const r = relDir ? relDir + "/" + e.name : e.name;
      if (skip(r)) continue;
      if (e.isDirectory()) { fs.mkdirSync(path.join(dest, r)); walk(r); }
      else fs.copyFileSync(path.join(ROOT, r), path.join(dest, r));
    }
  })("");
  return dest;
}
const runBuild = (cwd, ...args) => {
  const { spawnSync } = require("child_process");
  const r = spawnSync(process.execPath, ["build.js", ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: (r.stdout + r.stderr).trim() };
};
// Depoda henüz olmayan, geçerli dil kodları (geçici kopyaya dil ekleme denemeleri için)
const spareLangs = n => ["de", "es", "fr", "it", "nl", "pt-BR", "sv", "eo"].filter(c => !config.langs.includes(c)).slice(0, n);

module.exports = { launch, reporter, CONTRAST_AUDIT, copyRepo, runBuild, spareLangs, ROOT, TMP, FX, config, BASE_PATH, prefix, fileOf, rel, absUrl, i18n, fill, sleep };
