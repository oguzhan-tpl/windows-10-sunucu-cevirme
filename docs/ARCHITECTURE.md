# Astra Server — Mimari

## Ağ akışı

Internet
  |
  | HTTPS
  v
Cloudflare Edge
  |
  | outbound Cloudflare Tunnel
  v
Windows 10
  |
  +-- 127.0.0.1:8080
  |     Astra FastAPI
  |       +-- Auth / roller
  |       +-- Admin medya
  |       +-- Developer proje yönetimi
  |       +-- Reverse proxy
  |
  +-- data/server.sqlite3
  |
  +-- data/media/
  |
  +-- data/projects/
        +-- <slug>/
             +-- data.sqlite3
             +-- app/
             +-- assigned localhost port

## Roller

### user
- Giriş yapar.
- Adminin yayınladığı medya kataloğunu görür.
- Yetkili medya URL'sinden video/dosya izler.

### developer
- Kendi proje alanını oluşturur.
- Kendi proje SQLite veritabanını kullanır.
- ZIP kaynak kodunu yükler.
- Astra'nın atadığı localhost portunda kendi uygulamasını çalıştırır.
- /apps/<slug>/ adresinden kendi uygulamasına ulaşır.

### admin
- Medya yükler/siler.
- user / developer / admin hesabı açabilir.

## Neden modem portu açılmıyor?

Astra internete doğrudan inbound socket açmaz. Uygulama localhost üzerinde dinler. Cloudflare Tunnel sunucudan Cloudflare'a outbound bağlantı kurduğu için router üzerinde inbound port yönlendirmesi gerekmez.

## Developer uygulama sınırı

Web paneli Windows host üzerinde genel amaçlı CMD / PowerShell çalıştırmaz. ZIP kaynak kodu alınır; uygulama developer tarafından yerel Windows sürecinde başlatılır; Astra yalnızca atanmış localhost portuna HTTP reverse-proxy yapar.

Bu sınır, public bir hesabın web panelini kullanarak ana Windows makinesinde sınırsız komut çalıştırmasını engeller.

## Database sınırı

Her developer projesi ayrı SQLite dosyası kullanır. Ham .sqlite dosyası public route ile servis edilmez. Dashboard, bağlantı yolunu ve sınırlı KV API'sini gösterir.

## Üretim için sonraki katman

- Cloudflare Access ile /admin ve /developer alanlarına ek kimlik politikası
- rate limit
- audit log
- medya için Range/partial-content optimizasyonu
- proje uygulamaları için Windows sandbox / Job Object / düşük yetkili servis hesabı
- PostgreSQL opsiyonu
- otomatik sağlık kontrolü ve restart
- yedekleme
