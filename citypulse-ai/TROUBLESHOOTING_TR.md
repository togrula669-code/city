# CityPulse AI: `Failed to fetch` tanılama

`npm run groq:test` başarısı yalnızca **Node → Groq** yolunun çalıştığını kanıtlar. Uygulama ayrıca **Chrome → Express (/api/analyze/text) → Groq → Express → Chrome** zincirini kullanır.

## Kurulum
1. `node -v` (Node 20+ tavsiye edilir; tercihen güncel LTS sürüm.)
2. `npm install`
3. `.env` içinde `AI_PROVIDER=groq`, `GROQ_API_KEY` ve `GROQ_MODEL` ayarla. Gizli anahtarı paylaşma.
4. **Terminal 1:** `npm run dev`
5. **Terminal 2:** `npm run http:check`
6. Başarılıysa **Terminal 2:** `npm run http:live` (gerçek Groq analizi; kota harcar).

## Sonucu yorumla
- `http:check` başarısız: yanlış klasör/port, backend çalışmıyor, güvenlik yazılımı veya yerel bağlantı sorunu.
- `http:check` geçiyor, `http:live` başarısız: backend'in analiz yolu/Groq yapılandırması/timeout hatasına bak.
- İkisi de geçiyor ancak tarayıcı başarısız: `F12 → Network → analyze/text` isteğinin durumunu incele. `blocked`, `cancelled`, `failed`, `CORS` veya HTTP kodunu kontrol et; tarayıcı eklentileri ya da proxy etkiliyor olabilir.
- `http:live` sonucu `AI_INVALID_RESPONSE` ise API erişimi var ama model yapılandırılmış şemayı geçememiştir; bu hata artık ekranda JSON cevabı olarak görünmelidir.

Sunucu yeni sürümde analiz başında ve sonunda `[CityPulse]` satırları yazacak; hiçbir rapor metni veya API anahtarı loglanmaz.

## "File contents do not match the declared media type" (415)

This error occurs **in CityPulse's Express backend before Groq/Gemini is called**. It is not proof of a bad API key.

v0.4.1 improves MIME recognition for MP3 (`FF FA` included), M4A/MP4 and browser audio MIME aliases while retaining content checks.

- Try a genuine JPG/PNG/WebP image, MP3/WAV/OGG/WebM/M4A audio, or MP4/WebM video. If your phone generated HEIC, HEIF, MOV or AAC, export/convert to a supported format. Renaming the extension is not conversion.
- If using in-app recording, use Chrome/Edge and allow microphone/camera access. Some browsers output codecs the configured AI model cannot accept even when the container is valid.
- If the error persists, note the source file extension, browser, and exact error (including the request ID). Do not share API keys.
- To distinguish format validation from AI provider failures, read the request status in DevTools → Network → `/api/analyze/*`. HTTP 415 with `INVALID_FILE_SIGNATURE` is file validation; 401/403/429 from providers have different causes.

**Compatibility boundary:** The signature detector recognizes common container types; it does not decode or certify every codec. Video direct analysis versus sampled frames depends on the configured provider.
