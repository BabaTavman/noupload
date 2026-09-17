# NoUpload

Dosyanın hiçbir yere yüklenmediği PDF ve görsel araçları. Her şey tarayıcıda çalışır:
sunucu yok, hesap yok, dış istek yok.

Yayında: <https://babatavman.github.io/noupload/> (Türkçe) · <https://babatavman.github.io/noupload/en/> (English)

## Değişiklik yapmak

```
değişiklik  →  node build.js  →  git add . && git commit && git push
```

Kökteki `index.html`, `pdf.html`, `foto.html`, `foto-pdf.html`, `en/` klasörü, `sitemap.xml` ve
`robots.txt` **üretilmiş dosyalardır; elle düzenleme**, bir sonraki üretimde üzerine yazılır.
Düzenlenecek yerler aşağıda. GitHub Actions yok: üretilen dosyalar depoya commit edilir.

`node build.js` (ya da `npm run build`) yalnızca Node ister, kurulacak paket yoktur.
`node build.js --check` hiçbir şey yazmadan "üretmeyi unuttum mu?" sorusunu yanıtlar.

## Neyi nerede değiştiririm

| Ne | Nerede |
|---|---|
| Bir metin, sayfa başlığı, arama sonucu açıklaması | `i18n/tr.json` ve `i18n/en.json` |
| Bir sayfanın düzeni ya da aracın kodu | `src/<sayfa>.html` |
| Üst çubuk, "Diğer araçlar", araç kartı, `<head>` | `src/partials/` |
| Renkler, üst çubuk, düğmeler, kartlar (ortak stil) | `assets/site.css` |
| Tema düğmesi, metin biçimleme (ortak betik) | `assets/site.js` |
| Sitenin adresi, sayfa ve araç listesi | `build.js` dosyasının başındaki AYARLAR |

Şablonlarda `{{t.anahtar}}` o dilin metnini, `{{> parca}}` `src/partials/parca.html` dosyasını,
`{{root}}` köke dönüş yolunu (`""` ya da `"../"`) koyar. Araç kodunda metinler `STR.anahtar` ile,
sayı içerenler `fmt("anahtar", { n: 3 })` ile okunur; İngilizce gibi tekil/çoğul ayıran dillerde
metin `{ "one": "…", "other": "…" }` biçiminde yazılır.

## Diller ve adresler

Türkçe kök adreste durur (eski bağlantılar bozulmasın diye), diğer diller kendi klasöründe:
`pdf.html` ↔ `en/pdf.html`. Her sayfada `canonical`, her dil için `hreflang` ve `x-default`
(İngilizce) etiketleri ile öteki dile giden bağlantı üretilir.

**Yeni dil eklemek:** `i18n/en.json` dosyasını örneğin `i18n/de.json` diye kopyala, metinleri ve
`lang.name` / `lang.locale` değerlerini çevir, `node build.js` çalıştır. `/de/` sayfaları, bütün
sayfalardaki `hreflang` etiketleri, dil bağlantıları ve `sitemap.xml` kendiliğinden güncellenir.
Bir anahtar eksik ya da fazlaysa, dosya adı geçerli bir dil kodu değilse (`de.json`, `pt-BR.json`) ya da
`lang.locale` geçersizse üretim nedenini söyleyip durur. Üst çubuktaki dil bağlantıları sığmayınca sağa yaslı
olarak alt satıra iner; dört beş dilden sonra açılır bir dil menüsü düşünmek gerekebilir.

**Dil ya da sayfa kaldırmak:** dosyasını sil, `node build.js` çalıştır. Eski çıktılar (ör. `de/` klasörü)
kendiliğinden silinmez; üretim bunları "UYARI" diye listeler, `--check` de başarısız olur. Klasörü elle sil.

**Yeni araç eklemek:** `src/<ad>.html` şablonu, `src/icons/<ad>.svg` simgesi, her dil dosyasında
`<ad>` bölümü ile `common.tools.<ad>` (kart başlığı ve açıklaması); sonra `build.js` içindeki
`PAGES` ve `TOOLS` listelerine `<ad>`.

## Kütüphaneler

`lib/` altındaki pdf-lib ve pdf.js depoda durur; sayfalar hiçbir dış adrese istek yapmaz.
Sürümler, kaynaklar, özetler ve lisans metinleri `lib/` içinde (`lib/README.md`).

## Notlar

- `robots.txt` yalnızca alan adının kökünde (`babatavman.github.io/robots.txt`) geçerlidir; bu depo
  `/noupload/` altında yayınlandığı için arama motorları buradakini okumaz. Site haritasını
  Search Console'dan `…/noupload/sitemap.xml` adresiyle bildirmek gerekir. Site kendi alan adına
  taşınırsa dosya olduğu gibi çalışır (`build.js` içindeki `SITE` adresini güncellemek yeter).
- `.nojekyll` GitHub Pages'in dosyaları Jekyll'den geçirmeden, olduğu gibi yayınlamasını sağlar.
- Şablonların başındaki `<meta name="robots" content="noindex"><!-- build:remove … -->` satırı, `src/` altındaki ham
  şablonlar arama sonuçlarına girmesin diyedir; üretimde düşer. İşaret etiketle **aynı satırda** kalmalı — ayrılırsa
  üretim "robots meta etiketi kaldı" diyerek durur (yoksa bütün site dizinden düşerdi).
- Dil değiştirmek artık başka bir adrese gitmek demek: o sırada seçilmiş dosyalar ve yapılmış sıralama kaybolur.
