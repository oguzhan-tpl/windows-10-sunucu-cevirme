# Windows 10 Sunucu Cevirme — Astra v1

Windows 10 üzerinde router inbound portu açmadan internetten erişilebilen kişisel web servis platformu.

## Mimari

Internet
  -> Cloudflare Tunnel
  -> 127.0.0.1:8080
  -> Astra
      -> Auth / roller
      -> Admin medya
      -> Developer proje alanları
           -> proje SQLite
           -> 127.0.0.1:20xxx uygulaması

Astra çekirdeği internete doğrudan `0.0.0.0` üzerinden açılmaz. Dış erişim, Windows makinenizden Cloudflare'a doğru açılan outbound Tunnel üzerinden sağlanır. Bu nedenle modemde inbound port yönlendirmesi gerekmez. Cloudflare Quick Tunnel geçici bir `trycloudflare.com` adresi oluşturur; tünel işlemi kapanırsa adres de kapanır.

## Özellikler

- user / developer / admin hesapları
- admin medya yükleme, silme ve yetkili izleme
- developer başına ayrı proje klasörü
- proje başına ayrı SQLite veritabanı
- ZIP kaynak yükleme
- ZIP yüklenince otomatik proje deploy
- her projeye localhost portu
- /apps/<slug>/ reverse proxy
- panel içinde sabit/temporary public Tunnel adresi
- stabil hostname + named Cloudflare Tunnel desteği
- router port forwarding gerektirmeyen dış erişim
- admin kullanım analizi, kullanıcı/rol/şifre yönetimi
- admin proje ve veritabanı yönetimi
- aktif oturum ve disk kullanım görünümü
- ilk çalıştırmada otomatik admin parolası üretimi
- sağlık kontrolü ve otomatik başlangıç sıralaması

## Tek tık kurulum

Repo ana klasöründeki:

`KUR_VE_AC.bat`

dosyasını çalıştırın.

Akış:

1. Python sanal ortamı oluşturulur.
2. `requirements.txt` kurulur.
3. `.env` ve güçlü admin parolası oluşturulur.
4. Cloudflare Tunnel istemcisi hazırlanır.
5. Astra başlatılır ve `/healthz` kontrol edilir.
6. Public Tunnel başlatılır.
7. Local panel tarayıcıda açılır.

CMD ekranında ilk admin hesabı açık şekilde yazdırılır:

- Username: `admin`
- Password: oluşturulan güçlü parola

Aynı bilgiler:

`data\admin-credentials.txt`

dosyasına da kaydedilir.

## Dışarıdan erişim

ASTRA dış dünyaya doğrudan Windows portu açmaz. Cloudflare Tunnel, public hostname'i yerel servis ve porta bağlar. Cloudflare'ın güncel dokümantasyonuna göre yayınlanan uygulama için Cloudflare üzerinde bir domain ve Published Application route gerekir. citeturn360909search2turn360909search4

Kalıcı kullanım için:

1. Cloudflare DNS'e bağlı kendi domaininizi kullanın.
2. Tunnel adını `sunucumon` bırakın.
3. Örneğin `sunucumon.senin-domainin.com` hostname'ini Tunnel'a bağlayın.
4. Published Application Service URL'sini `http://127.0.0.1:8080` yapın.
5. Tunnel token'ını sadece kendi bilgisayarınızdaki `.env` dosyasına yazın.
6. `KUR_VE_AC.bat` stable mode'da Astra'yı 8080 portunda tutar.
7. `PUBLIC_AC.bat` public `/healthz` kontrolü yapar ve Tunnel watcher'ını çalıştırır.

Örnek:

~~~text
PUBLIC_HOSTNAME=sunucum.senin-domainin.com
CLOUDFLARE_TUNNEL_NAME=sunucumon
CLOUDFLARE_TUNNEL_TOKEN=<sadece-lokal-.env>
~~~

**Önemli:** `sunucumon` tek başına internet üzerinde sihirli bir domain değildir. Stabil URL için sizin kontrol ettiğiniz bir domain/hostname gerekir. Quick Tunnel (`trycloudflare.com`) geçicidir ve yeniden başlatmada değişebilir. citeturn360909search2turn360909search9

Panel, stable hostname'i kullanıcıya gösterir ve tek tıkla kopyalanabilir. Windows makine ve Tunnel tekrar çevrimiçi olduğu sürece aynı adres kullanılabilir.

## Developer akışı

1. Developer hesabıyla giriş yapın.
2. Proje oluşturun.
3. Sistem projeye localhost portu verir.
4. ZIP dosyasını **ZIP yükle ve çalıştır** ile gönderin.
5. Astra proje kaynaklarını güvenli şekilde açar, proje sanal ortamını oluşturur, bağımlılıkları kurar ve uygulamayı localhost portunda başlatır.
6. Proje çalışıyorsa panelden **Uygulamayı aç** bağlantısı kullanılabilir.

Varsayılan giriş noktası:

`main:app`

Değiştirmek için proje ZIP'inin köküne örneğin:

`deploy.json`

ekleyebilirsiniz:

~~~json
{
  "entrypoint": "main:app"
}
~~~

Proje uygulaması Windows hesabınızla çalışır; bu mimari tam bir güvenlik sandbox'ı değildir.

## Database

Her proje kendi `data.sqlite3` dosyasına sahiptir.

Developer paneli bağlantı bilgisini gösterir ve KV API sağlar:

`GET /api/projects/<slug>/data/<key>`

`PUT /api/projects/<slug>/data/<key>`

Ham SQLite dosyası public olarak servis edilmez.

## Admin yönetimi

Yönetim ekranı artık kaynak bazlıdır:

- toplam kullanıcı, geliştirici, admin ve aktif oturum sayısı
- kullanıcı başına proje ve veritabanı sayısı
- kullanıcı proje alanı, DB alanı ve kota yüzdesi
- veritabanının toplam depolamadaki payı
- en çok alan kullanan kullanıcı
- Windows diskinin toplam/kullanılan/boş alanı
- tüm veritabanları: sahibi, kayıt sayısı, boyutu ve durumu
- kullanıcı rolü değiştirme, şifre sıfırlama ve silme
- proje durdurma ve proje/veritabanı silme
- aktif adminin ve son admin hesabının yanlışlıkla silinmesini engelleyen korumalar

## Güvenlik

- Session cookie HttpOnly + imzalıdır.
- Parolalar scrypt ile hashlenir.
- Admin rol/şifre değişikliğinde mevcut oturumlar iptal edilir.
- Proje ZIP'lerinde path traversal kontrolü vardır.
- Developer yalnızca kendi projelerine erişir.
- Host üzerinde web panelinden genel amaçlı CMD/PowerShell çalıştırılmaz.
- Proje uygulamaları localhost'ta tutulur ve Astra reverse proxy üzerinden yayınlanır.
- GET/HEAD reverse-proxy trafiği belleğe tamamen alınmadan akış halinde iletilir.
- Public URL'yi paylaşan herkes login sayfasına ulaşabilir; uygulama içeriği hesap yetkileriyle korunur.
- Proje uygulamaları Windows hesabıyla çalıştığı için bu yapı tam güvenlik sandbox'ı değildir.
- Kalıcı internet yayınında Cloudflare Access, rate limiting, audit log, düşük yetkili Windows hesabı ve daha güçlü process izolasyonu kullanılması önerilir.

## Geliştirme

Yerel çalıştırma:

~~~powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m app.main
~~~

Yerel adres:

`http://127.0.0.1:8080`
