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
- panel içinde public Tunnel adresi
- router port forwarding gerektirmeyen dış erişim
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

`PUBLIC_AC.bat` Cloudflare Quick Tunnel başlatır.

CMD içinde:

`PUBLIC URL : https://....trycloudflare.com`

şeklinde gerçek internet adresi gösterilir ve:

`data\public-url.txt`

dosyasına kaydedilir.

Panelde giriş yaptıktan sonra Genel Bakış bölümünde aynı adres gösterilir.

Quick Tunnel geçici kullanım içindir. Kalıcı özel hostname için Cloudflare üzerinde normal bir Tunnel ve kendi hostname'inizi yapılandırmanız gerekir.

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

## Güvenlik

- Session cookie HttpOnly + imzalıdır.
- Parolalar scrypt ile hashlenir.
- Proje ZIP'lerinde path traversal kontrolü vardır.
- Developer yalnızca kendi projelerine erişir.
- Host üzerinde web panelinden genel amaçlı CMD/PowerShell çalıştırılmaz.
- Proje uygulamaları localhost'ta tutulur ve Astra reverse proxy üzerinden yayınlanır.
- Public URL'yi paylaşan herkes login sayfasına ulaşabilir; uygulama içeriği hesap yetkileriyle korunur.
- Kalıcı internet yayınında Cloudflare Access, rate limiting, audit log, düşük yetkili Windows hesabı ve daha güçlü process izolasyonu eklenmesi önerilir.

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
