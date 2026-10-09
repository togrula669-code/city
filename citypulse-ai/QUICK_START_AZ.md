# CITYPULSE AI v0.4.0 — Sürətli quraşdırma (Windows + VS Code)

1. ZIP-i aç və `package.json` olan **citypulse-ai** qovluğunu Visual Studio Code ilə aç.
2. Kompüterdə Node.js LTS qurulu olsun (20.19+ / 22+).
3. VS Code terminalında bunları yaz:

```powershell
npm install
Copy-Item .env.example .env
notepad .env
```

4. `.env` içində `GROQ_API_KEY` dəyərini öz açarınla doldur. Açarı heç kimlə paylaşma. `GROQ_MODEL` və `GROQ_VISION_MODEL` öz hesabında mövcud modellər olmalıdır.
5. Operator paneli üçün `.env`-də `ADMIN_TOKEN` dəyərinə uzun və təxmin edilməsi çətin şifrə ver.
6. Yoxla və işə sal:

```powershell
npm run groq:models
npm run groq:test
npm run check
npm run dev
```

7. Brauzerdə aç: **http://localhost:3001**

## Vacib xüsusiyyətlər

- Groq video faylını bütöv anlamır: brauzer videodan **3 real kadr** çıxarır, görüntü olaraq AI-ya göndərir. Videonun **səsi analiz edilmir**. Audio üçün ayrıca qeyd/yükləmə et.
- Xəritə Leaflet + OpenStreetMap ilə işləyir; internet lazımdır.
- Nümunə hadisələr üçün `npm run demo:seed` işlədə bilərsən. Bunlar **real Bakı şikayətləri deyil**, sintetik məlumatdır.
- Şəkil/audio sübutunu operatora saxlamaq istəyirsənsə `.env` faylında `EVIDENCE_STORAGE=local` yaz və istifadəçinin formadakı **razılıq xanasını** işarələ. Standartda sübut saxlanmır. Video üçün yalnız bir kadr saxlanır.
- AI modelinin aktiv olub-olmamasını canlı test etməlisən. Test kodlarının keçməsi API hesabının işləməsi demək deyil.
- İşləməyən modellərə görə **əvvəlcə `npm run groq:models` nəticəsinə bax**. API-ni frontend-də yazma.

Əlavə risklər və demo yoxlama siyahısı: `HACKATHON_AUDIT.md`.
