# lib/ — depoda tutulan kütüphaneler

Sayfalar hiçbir dış adrese istek yapmasın diye kütüphaneler buraya indirildi. Dosyalar
değiştirilmedi; özetleri cdnjs'in yayımladığı SRI değerleriyle ve npm paketindeki
(jsDelivr üzerinden) kopyalarla birebir aynıdır.

| Dosya | Paket ve sürüm | Lisans | Kaynak |
|---|---|---|---|
| `pdf-lib.min.js` | pdf-lib 1.17.1 | MIT | <https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js> |
| `pdf.min.js` | pdf.js (pdfjs-dist) 3.11.174 | Apache-2.0 | <https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js> |
| `pdf.worker.min.js` | pdf.js (pdfjs-dist) 3.11.174 | Apache-2.0 | <https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js> |

```
pdf-lib.min.js     sha512-z8IYLHO8bTgFqj+yrPyIJnzBDf7DDhWwiEsk4sY+Oe6J2M+WQequeGS7qioI5vT6rXgVRb4K1UVQC5ER7MKzKQ==
pdf.min.js         sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==
pdf.worker.min.js  sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw==
```

Doğrulamak için: `openssl dgst -sha512 -binary lib/pdf.min.js | openssl base64 -A`

Sürüm yükseltirken üç dosyayı birlikte değiştir (`pdf.min.js` ile `pdf.worker.min.js` aynı
sürümden olmak zorunda) ve bu tabloyu güncelle.

- pdf-lib: © Andrew Dillon — <https://github.com/Hopding/pdf-lib> — MIT, metni `LICENSE-pdf-lib.md`
- pdf.js: © Mozilla Foundation — <https://github.com/mozilla/pdf.js> — Apache License 2.0, metni `LICENSE-pdfjs.txt`

Lisans metinleri paketlerin kendi dağıtımından (npm, aynı sürümler) alındı.
