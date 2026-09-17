/* ==================================================================
   NoUpload — ortak betik. Dört sayfa da bunu yükler.
   Önce sayfadaki <script>const STR = {…}</script> çalışır: o sayfanın
   metinleri, sayfanın dilinde (build.js i18n/*.json'dan yerleştirir).
   Sayfaya özgü araç kodu bu dosyadan SONRA gelir; buradaki el(), fmt()
   ve tema işlevlerini kullanabilir.
================================================================== */
const el = id => document.getElementById(id);

/* ------------------------------------------------------------------
   METİN — fmt("nFiles", { n: 3 })
   STR'deki metinde {n} gibi yer tutucular doldurulur. Metin tek bir
   cümle yerine { one: "…", other: "…" } ise dilin çoğul kuralına göre
   seçilir ("1 file" / "3 files"); sayı her zaman n adıyla verilir.
------------------------------------------------------------------ */
const pluralRules = new Intl.PluralRules(document.documentElement.lang);
function fmt(key, vars = {}){
  let text = STR[key];
  if (text && typeof text === "object") text = text[pluralRules.select(Number(vars.n))] ?? text.other;
  return String(text).replace(/\{(\w+)\}/g, (whole, name) => name in vars ? vars[name] : whole);
}

// Kullanıcıdan gelen metni (ör. dosya adı) innerHTML'e koymadan önce: etiket olarak yorumlanmasın
const esc = s => String(s).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");

/* ------------------------------------------------------------------
   ÜST ÇUBUK — kırıntı ("/ pdf") çubuğu iki satıra düşürüyorsa gizlenir.
   Hangi genişlikte sığdığı şablonlardaki @media kurallarında iki dil için
   ölçülü; bu ince ayar, dil sayısı ya da yazı boyutu değiştiğinde de
   çubuğun "bir tek, bir iki satır" olmasını önler.
------------------------------------------------------------------ */
function fitBar(){
  const crumb = document.querySelector(".brand small");
  if (!crumb) return;
  crumb.hidden = false;                                            // önce göstermeyi dene
  const lead = document.querySelector(".barlead"), btns = document.querySelector(".barbtns");
  if (btns.offsetTop > lead.offsetTop) crumb.hidden = true;        // düğmeler alt satıra düştüyse kırıntıdan vazgeç
}
addEventListener("resize", fitBar);
fitBar();

/* ------------------------------------------------------------------
   TEMA — üç durum: sistem (kayıt yok) / açık / koyu.
   Düğme tıklayınca ne olacağını yazar.
   Sıra: sistem → sistemin tersi → sistemle aynı → sistem.
   Kayıtlı tercihi sayfa açılırken uygulayan küçük betik <head>'dedir
   (CSS'ten önce çalışsın, renk yanıp sönmesin diye).
------------------------------------------------------------------ */
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
const THEME_LABEL = {dark:"themeDark", light:"themeLight", system:"themeSystem"};
const currentTheme = () => document.documentElement.getAttribute("data-theme") || "system";
function nextTheme(t){
  const os = darkMQ.matches ? "dark" : "light";
  if (t === "system") return os === "dark" ? "light" : "dark";
  return t === os ? "system" : os;
}
function setTheme(t){
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  try { t === "system" ? localStorage.removeItem("noupload-theme") : localStorage.setItem("noupload-theme", t); } catch(e){}
  paintThemeBtn();
}
function paintThemeBtn(){ el("theme").textContent = STR[THEME_LABEL[nextTheme(currentTheme())]]; fitBar(); }
// Düğmenin genişliği üç yazıdan en uzununa göre sabitlenir (site.css'teki en küçük genişlik taban olarak kalır):
// hangi dilde olursa olsun yazı değişince üst çubuk oynamasın. En küçük genişlik verilmemiş yerde (iki dilli ana sayfa) dokunulmaz.
{
  const btn = el("theme"), floor = parseFloat(getComputedStyle(btn).minWidth) || 0;
  if (floor > 0) {
    btn.style.minWidth = "0";                                       // yazıların doğal genişliği ölçülsün
    const widest = Math.max(...Object.values(THEME_LABEL).map(key => { btn.textContent = STR[key]; return btn.getBoundingClientRect().width; }));
    btn.style.minWidth = widest > floor ? Math.ceil(widest) + "px" : "";   // taban yetiyorsa site.css'teki değer aynen kalır
  }
}
el("theme").addEventListener("click", () => setTheme(nextTheme(currentTheme())));
darkMQ.addEventListener("change", paintThemeBtn);
// "Geri" ile sayfa tarayıcının önbelleğinden gelirse betikler yeniden çalışmaz:
// başka sayfada değiştirilmiş olabilecek kayıtlı temayı burada yeniden uygula.
addEventListener("pageshow", e => {
  if (!e.persisted) return;
  let t = null;
  try { t = localStorage.getItem("noupload-theme"); } catch(err){}
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  paintThemeBtn();
});
paintThemeBtn();
