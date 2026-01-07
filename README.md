
# 🚚 SPX Assignment Task Dashboard

Dashboard manajemen logistik modern untuk **Shopee Xpress (SPX)** yang dirancang untuk memantau penugasan kurir di wilayah Tompobulu, Biringbulu, dan Bungaya secara real-time.

![SPX Banner](https://spx.co.id/static/media/logo.201d4a04.svg)

## ✨ Fitur Utama

- **Live Logistics Insights**: Menggunakan **Gemini AI** untuk ringkasan operasional.
- **QR Code Verification**: Verifikasi tugas berbasis QR.
- **Secure Dashboard**: Fitur anti-screenshot dan proteksi data kurir.
- **Spreadsheet Integration**: Sinkronisasi otomatis dengan Google Sheets.

## 🚀 Deployment ke Vercel (Rekomendasi)

1. Hubungkan repository GitHub Anda ke [Vercel](https://vercel.com).
2. Vercel akan mendeteksi **Vite** secara otomatis.
3. **Penting**: Tambahkan Environment Variable di Vercel Dashboard:
   - `API_KEY`: (Isi dengan API Key Gemini Anda)
4. Klik **Deploy**.

## 🛠️ Instalasi Lokal

1. Clone & Install: `npm install`
2. Set `.env`: `API_KEY=your_key`
3. Run: `npm run dev`

---
Developed with ❤️ by Senior Frontend Team.
