# Testler

Sayfaları gerçek bir tarayıcıda (başsız Chrome ya da Edge) açıp kullanıcı gibi kullanan kontroller.
Kurulacak paket yok.

**Gerekenler:** Node 22 ya da üstü (yerleşik `WebSocket` ve `fetch` için) ve kurulu bir Chrome ya da Edge.
Tarayıcı kendiliğinden bulunur; bulunamazsa yolunu `CHROME_PATH` ortam değişkeniyle ver.

```
npm test                 hepsi                                   (yaklaşık 5 dakika)
npm run test:quick       hızlı tur: seo + tools                  (yaklaşık 15 saniye)
npm test -- site         yalnızca adı verilen takım(lar): seo tools foto-pdf site robustness
npm test -- --verbose    geçen kontrolleri de yaz
```

`npm test` önce `node build.js --check` ile üretilmiş dosyaların güncel olduğuna bakar: **önce
`node build.js`, sonra test.** Bir takım kalırsa ötekiler yine koşar; sonda özet yazılır ve çıkış kodu 1 olur.

## Takımlar

| Takım | Dosya | Neye bakar |
|---|---|---|
| `seo` | `seo.test.js` | Her sayfada `lang`, title, description, canonical, hreflang + x-default, dil bağlantıları; şablon artığı ve kırık bağlantı yok; yüklenen her kaynak yerel; `sitemap.xml`, `robots.txt`. Deponun geçici kopyasında `build.js`: tekrar üretim değişiklik yapmıyor, CRLF/BOM zararsız, **yeni dil = tek dosya**, hatalı girdide açık hata, kaldırılan dilin bayat sayfaları fark ediliyor. Tarayıcı istemez. |
| `tools` | `tools.test.js` | `pdf.html` (birleştirme, sayfa seçme, döndürme) ve `foto.html` (küçültme, EXIF yönü) her dilde; üretilen PDF/JPEG açılıp bakılır. Üç araç da sayfa açıldıktan sonra **bağlantı kesilince** çalışıyor. Site dışına tek istek yok. |
| `foto-pdf` | `foto-pdf.test.js` | Fotoğraftan PDF uçtan uca, her dil için ayrı koşar: sıra, EXIF ve döndürme, sayfaya sığdırma, kalite sınırları, 120 fotoğraf, 30 × 12 MP, aynı anda tek fotoğraf açık, iptal, 360px'te dört tema durumu, dokunma hedefleri. Üretilen PDF pdf.js ile çizilip piksellerinden doğrulanır. |
| `site` | `site.test.js` | Her dil × her sayfa: tema düğmesi (üç durum, kalıcılık, öteki dile geçince korunma, "Geri" önbelleği), marka ikonu, 320–1200px'te taşma yok, kırıntı sınırları, üst çubuğun zıplamaması, "← Araçlar", kartlar, "Diğer araçlar". |
| `robustness` | `robustness.test.js` | Geçici kopyalara bir ve üç dil daha eklenip üst çubuk 300–760px arasında taranır. `pdf.html`: dosya adı HTML olarak yorumlanmıyor; worker alınamadan bağlantı kesilirse açık mesaj ve yenilemeden toparlanma. |

Takımlar tek başına da çalışır ve bölüm seçilebilir: `node tests/site.test.js C`,
`LANG_CODE=en node tests/foto-pdf.test.js T9` (PowerShell: `$env:LANG_CODE="en"; node tests/foto-pdf.test.js T9`).

Beklenen metinler `i18n/*.json` dosyalarından, diller/sayfalar/site adresi `node build.js --print-config`
çıktısından okunur: yeni bir dil ya da araç eklenince testler kendiliğinden onu da kapsar.
(`tools` ve `foto-pdf` takımları aracın kendi davranışını sınadığı için yeni bir *araç* kendi testini ister.)

## `npm test` dışında kalan iki araç

- **`npm run test:visual`** — çalışma kopyasındaki sayfaları son commit'tekilerle **piksel piksel** karşılaştırır
  (`node tests/visual-diff.js <sürüm>` ile başka bir commit/dal). Fark varsa `tests/.tmp/visual/` altına
  eski / yeni / fark görüntülerini yazar ve çıkış kodu 1 olur. Görünümü bilerek değiştirdiysen fark beklenen şeydir;
  "yalnızca kodu toparladım, hiçbir şey değişmemeli" dediğin işlerde değerlidir.
- **`npm run test:live`** — yayındaki siteyi doğrular: dosyalar depodakilerle bayt bayt aynı mı, her sayfada
  etiketler doğru mu, bağlantı kesilince araçlar çalışıyor mu, site dışına istek var mı. Push'tan birkaç dakika
  sonra çalıştır; internet ister.

## Dosyalar

- `harness.js` — yerel sunucu + tarayıcı. Sunucu yayını taklit eder (site `build.js`'teki adresin yolunda, ör.
  `/noupload/`; klasör adresleri `index.html` verir; doğru dosya türleri). `launch()` şunları döndürür:
  `go`, `navigate`, `reload`, `ev` (sayfada JS çalıştırır), `click`, `setFiles` (gerçek dosya seçimi),
  `waitUntil`, `os("dark")` (işletim sistemi teması), `size` / `mobile` (ekran), `offline`, `shot`, `send` (ham CDP).
  `reporter()` sonuç defteridir: konsol hatası ve site dışına istek de başarısızlık sayılır.
- `fixtures.js` — test fotoğrafları ve PDF'leri. İlk koşuda `tests/.tmp/fixtures/` altında üretilir, depoya girmez.
  Her fotoğrafın köşeleri renkli, ortasında sıra numarası ikili kodludur; testler üretilen PDF'ten yönü ve sırayı
  böyle okur. Baştan üretmek için: `node tests/fixtures.js --fresh`.
- `run.js` — koşucu.

`tests/.tmp/` (örnekler, ekran görüntüleri `shots/`, geçici kopyalar) `.gitignore`'dadır; silmek serbest.

## Bilinmesi gerekenler

- Telefon genişlikleri `mobile()` ile ölçülür. `size()` masaüstünü taklit eder; oradaki 15px'lik kaydırma
  çubuğu genişlik sınırlarını kaydırır.
- Yerel sunucu `cache-control: no-cache` gönderir. `no-store` gönderseydi Chrome sayfayı "Geri" önbelleğine
  almaz, o kontrol yanlış alarm verirdi (GitHub Pages `max-age=600` gönderir).
- Testler Chrome'la koşar; Safari ve Firefox'a özgü davranışlar (ör. iOS'ta fotoğraf seçici) burada sınanmaz.
