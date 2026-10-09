# CityPulse AI — Groq Kurulumu (Windows PowerShell)

## 1. İlk kurulum

ZIP dosyasını çıkart. VS Code'da **`citypulse-ai`** klasörünü aç; burası `package.json` dosyasının bulunduğu klasördür.

```powershell
npm install
Copy-Item .env.example .env
notepad .env
```

`.env` dosyasında bunları yapılandır:

```env
AI_PROVIDER=groq
GROQ_API_KEY=BURAYA_GROQ_API_ANAHTARINIZ
GROQ_MODEL=openai/gpt-oss-120b
GROQ_VISION_MODEL=qwen/qwen3.8-27b
GROQ_AUDIO_MODEL=whisper-large-v3-turbo
GROQ_VIDEO_FALLBACK=none
```

`ADMIN_TOKEN` için kimseyle paylaşmadığın uzun bir değer kullan. **Gerçek `.env` dosyasını başkalarıyla paylaşma veya GitHub'a yükleme.** API anahtarını tarayıcıya, frontend JavaScript'e veya terminal hata görüntüsüne yazma.

## 2. Terminalden anahtar ve model vermek (alternatif)

`GROQ_API_KEY` değerini PowerShell komut geçmişine yazmadan girmek için:

```powershell
$secret = Read-Host 'Enter Groq API key' -AsSecureString
$env:GROQ_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
Remove-Variable secret
$env:AI_PROVIDER = 'groq'
$env:GROQ_MODEL = 'openai/gpt-oss-120b'
$env:GROQ_VISION_MODEL = 'qwen/qwen3.8-27b'
$env:GROQ_AUDIO_MODEL = 'whisper-large-v3-turbo'
```

Bu yöntem ayarları **sadece mevcut PowerShell oturumunda** tutar. Terminali kapatınca tekrar girmen gerekir. `.env` dosyası daha kalıcıdır. PowerShell ortam değişkenleri `.env` değerlerinden önceliklidir.

## 3. Canlı doğrulama, sonra sunucuyu çalıştır

```powershell
npm run diagnose
npm run groq:models
npm run groq:test
npm run dev
```

- `diagnose`: Anahtar değerini göstermeden yapılandırmanın var olup olmadığını söyler.
- `groq:models`: API anahtarına erişimi ve aktif model ID'lerini sunucudan öğrenir (çıkarım kotası tüketmez).
- `groq:test`: 1 **gerçek** metin analizi yapar; kota/bakiyeyi tüketebilir.
- `dev`: Uygulamayı çalıştırır. Aç: **http://localhost:3001**.

## 4. Her analiz tipi hangi modeli kullanıyor?

| Rapor türü | Groq modeli | Çalışma şekli |
| --- | --- | --- |
| Yazı | `GROQ_MODEL` (`openai/gpt-oss-120b`) | JSON formatında olay analizi |
| Görsel | `GROQ_VISION_MODEL` (`qwen/qwen3.8-27b`) | Görsel + yazı ile JSON analizi; **preview model**, değişebilir |
| Ses | `GROQ_AUDIO_MODEL` (`whisper-large-v3-turbo`) + `GROQ_MODEL` | Önce konuşmayı yazıya çevirir; sonra metin analizi yapar |
| Video | Groq üzerinden doğrudan desteklenmez | İsteğe bağlı Gemini yönlendirmesi gerekir |

Video için **bilerek** Gemini eklemek istiyorsan `.env` içinde `GEMINI_API_KEY`, `GEMINI_MODEL` alanlarını doldur ve `GROQ_VIDEO_FALLBACK=gemini` yap. Kod, Groq kotası bittiğinde gizlice Gemini'ye geçmez. Gemini ayarlarını doğrulamadan video analizinin çalışacağını varsayma.

## 5. Sık görülen hatalar

- `ENOENT package.json`: Yanlış klasördesin. `cd citypulse-ai` ile `package.json` bulunan yere geç.
- `AI_NOT_CONFIGURED`: `.env` içindeki `GROQ_API_KEY` boş veya yanlış konumda.
- `AI_AUTH_FAILED`: Anahtar geçersiz veya seçilen model için izin yok.
- `AI_MODEL_UNSUPPORTED`: Aktif olmayan/decommissioned model; `npm run groq:models` ile karşılaştır.
- `AI_QUOTA_EXCEEDED` (429): Bekle veya Groq hesap limitlerini kontrol et. Arka arkaya sınırsız deneme yapılmaz.
- `AI_INVALID_RESPONSE`: Model JSON şemasına uymadı; yeniden deneyebilirsin; sahte sonuç verilmez.
- `AI_UNSUPPORTED_MODALITY`: Groq ile video gönderdin; Gemini yönlendirmesi aç veya fotoğraf kullan.
- `403 OpenStreetMap`: Harita döşemeleri engellenmiş olabilir. Referrer policy düzeltmesi mevcut. Terminali yeniden başlat, `Ctrl+Shift+R` ile yenile. Gerekirse koordinatları elle gir.

## 6. Güvenlik ve gerçekçi sınırlar

Bu bir hackathon prototipidir; hiçbir gerçek belediyeye rapor iletmez. API anahtarları **yalnızca backend** tarafından kullanılır. Hiçbir AI servisine bağlanmadan statik arayüz çalışabilir ama gerçek analiz için **kullanıcıya ait geçerli anahtar ve kota** gerekir. Görsel modelinin preview sürümü zamanla değişebilir. Model listesi başarılı bile olsa asıl istek, kota, yüklenen medya ve model izinleri nedeniyle başarısız olabilir.

**Doküman referansları:**
- https://console.groq.com/docs/models
- https://console.groq.com/docs/deprecations
- https://console.groq.com/docs/vision
- https://console.groq.com/docs/speech-to-text
- https://console.groq.com/docs/api-reference
