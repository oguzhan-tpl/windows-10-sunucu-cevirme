# Windows 10 Sunucu Cevirme — Astra v1

Windows 10 üzerinde modemden inbound port açmadan dışarıdan erişilebilen kişisel web servis platformu.

## Şema

Internet
  -> Cloudflare Tunnel
  -> 127.0.0.1:8080
  -> Astra
      -> Auth / roller
      -> Admin medya
      -> Developer proje alanları
           -> proje SQLite
           -> 127.0.0.1:20xxx uygulaması

## Özellikler

- user / developer / admin hesapları
- admin medya yükleme, silme ve yetkili izleme
- developer başına ayrı proje klasörü
- proje başına ayrı SQLite veritabanı
- ZIP ile proje kaynaklarını sunucuya alma
- her projeye sabit localhost portu
- /apps/<slug>/ reverse proxy
- Cloudflare Tunnel ile router inbound portu gerektirmeyen yayın

Bu sürüm web panelinden host üzerinde CMD/PowerShell komutu çalıştırmaz. Developer kodunu sunucuya alabilir ve kendi uygulamasını atanan localhost portunda yerel olarak başlatır. Böylece public web paneli genel amaçlı remote-shell haline gelmez.

## Kurulum

~~~powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
.\.venv\Scripts\python.exe -m app.main
~~~

Yerel adres: http://127.0.0.1:8080

İnternet yayını için güçlü bir SERVER_SECRET kullanın. Cloudflare üzerinden HTTPS yayınlandığında COOKIE_SECURE=true yapın.

## Cloudflare Tunnel

Cloudflare panelinden Tunnel oluşturun ve public hostname'i Astra'nın lokal servisine bağlayın:

http://127.0.0.1:8080

Windows'ta cloudflared'i servis olarak kurmak için:

~~~powershell
.\scripts\install_cloudflared.ps1 -TunnelToken "BURAYA_TUNNEL_TOKEN"
~~~

Tunnel token'ını GitHub'a commit etmeyin.

## Developer akışı

1. Developer hesabıyla giriş yap.
2. Proje oluştur.
3. Sistem 20000-20999 aralığında bir localhost portu atar.
4. ZIP kaynak kodunu projeye yükle.
5. Windows terminalinde:
   scripts\run_project.bat PROJE_SLUG PORT
6. Uygulama:
   /apps/PROJE_SLUG/
   yolundan erişilebilir.

Proje uygulaması varsayılan olarak main.py içindeki app nesnesini ASGI uygulaması olarak kullanır. requirements.txt proje bağımlılıkları içindir.

## Database

Her proje kendi data.sqlite3 dosyasına sahiptir. Developer paneli lokal SQLite bağlantı yolunu ve HTTP KV API'sini gösterir.

GET /api/projects/<slug>/data/<key>
PUT /api/projects/<slug>/data/<key>

Ham SQLite dosyası public olarak servis edilmez.
