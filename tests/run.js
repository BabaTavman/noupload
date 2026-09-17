/* ==================================================================
   Test koşucusu — npm test

     node tests/run.js                 hepsi (yaklaşık 5 dakika)
     node tests/run.js --quick         hızlı tur: seo + tools (yaklaşık 15 saniye)
     node tests/run.js seo site        yalnızca adı verilen takımlar
     node tests/run.js --verbose       geçen kontrolleri de yaz

   Önce "node build.js --check" ile üretilmiş dosyaların güncel olduğuna bakar; sonra takımları
   sırayla, her birini ayrı süreçte çalıştırır. Bir takım kalırsa ötekiler yine koşar; sonda
   özet yazılır, herhangi biri kaldıysa çıkış kodu 1 olur.
================================================================== */
"use strict";
const path = require("path"), { spawnSync } = require("child_process");
const { ROOT, config } = require("./harness.js");

const SUITES = [
  { name: "seo",        file: "seo.test.js",        quick: true,  what: "etiketler, site haritası, bağlantılar, build.js davranışı" },
  { name: "tools",      file: "tools.test.js",      quick: true,  what: "pdf ve foto araçlarının işlevi, çevrimdışı, dış istek yok" },
  { name: "foto-pdf",   file: "foto-pdf.test.js",   quick: false, what: "Fotoğraftan PDF uçtan uca", perLang: true },
  { name: "site",       file: "site.test.js",       quick: false, what: "tema, üst çubuk, dar ekran, kartlar — her dil × her sayfa" },
  { name: "robustness", file: "robustness.test.js", quick: false, what: "çok dilli üst çubuk, pdf.html sağlamlığı" },
];

const args = process.argv.slice(2), flags = args.filter(a => a.startsWith("--")), names = args.filter(a => !a.startsWith("--"));
const unknown = [...names.filter(n => !SUITES.some(s => s.name === n)), ...flags.filter(f => !["--quick", "--verbose"].includes(f))];
if (unknown.length) { console.error(`Bilinmeyen: ${unknown.join(", ")}\nTakımlar: ${SUITES.map(s => s.name).join(", ")}   Seçenekler: --quick --verbose`); process.exit(2); }
const verbose = flags.includes("--verbose");
const chosen = SUITES.filter(s => names.length ? names.includes(s.name) : flags.includes("--quick") ? s.quick : true);

const check = spawnSync(process.execPath, ["build.js", "--check"], { cwd: ROOT, encoding: "utf8" });
if (check.status !== 0) { console.error((check.stdout + check.stderr).trim() + '\n\nÜretilmiş dosyalar güncel değil: önce "node build.js" çalıştır.'); process.exit(1); }

const runs = chosen.flatMap(s => s.perLang ? config.langs.map(l => ({ ...s, label: `${s.name} (${l})`, env: { LANG_CODE: l } })) : [{ ...s, label: s.name, env: {} }]);
const summary = []; let anyFailed = false;
for (const run of runs) {
  process.stdout.write(`\n▶ ${run.label} — ${run.what}\n`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, run.file)], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...run.env }, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || ""), secs = Math.round((Date.now() - t0) / 1000);
  const m = out.match(/(\d+) geçti, (\d+) kaldı/);
  // çıkış kodu 0 olsa bile özet satırı yoksa ya da hiçbir kontrol koşmadıysa başarı sayılmaz
  const ok = r.status === 0 && m && +m[1] > 0 && +m[2] === 0;
  if (!ok) anyFailed = true;
  const lines = out.split("\n");
  if (verbose) console.log(out.trimEnd());
  else {
    const show = []; let keep = false;
    for (const line of lines) {
      if (/^(FAIL|HATA)/.test(line)) keep = true; else if (/^(PASS|BİLGİ|\d+ geçti)/.test(line) || line === "") keep = false;
      if (keep || line.startsWith("BİLGİ")) show.push(line);
    }
    if (show.length) console.log(show.join("\n"));
    if (!m && !show.length) console.log(out.trimEnd().split("\n").slice(-15).join("\n"));       // beklenmedik çıktı: son satırlar
  }
  console.log(`${ok ? "GEÇTİ" : "KALDI"}  ${run.label}: ${m ? `${m[1]} geçti, ${m[2]} kaldı` : "özet yok (takım yarıda kesildi)"} · ${secs} sn`);
  summary.push(`${ok ? "GEÇTİ" : "KALDI"}  ${run.label.padEnd(16)} ${m ? `${m[1].padStart(4)} geçti ${m[2].padStart(3)} kaldı` : "yarıda kesildi     "}  ${String(secs).padStart(5)} sn`);
}
console.log("\n" + "=".repeat(60) + "\n" + summary.join("\n") + "\n" + "=".repeat(60));
console.log(anyFailed ? "SONUÇ: KALDI" : "SONUÇ: hepsi geçti");
process.exit(anyFailed ? 1 : 0);
