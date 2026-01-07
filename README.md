
# 🚚 SPX Assignment Task Dashboard

Dashboard manajemen logistik modern untuk **Shopee Xpress (SPX)** yang dirancang untuk memantau penugasan kurir di wilayah Tompobulu, Biringbulu, dan Bungaya secara real-time.

![SPX Banner](https://spx.co.id/static/media/logo.201d4a04.svg)

## ✨ Fitur Utama

- **Live Logistics Insights**: Menggunakan **Gemini AI** untuk memberikan ringkasan operasional harian secara cerdas.
- **Multi-Station Support**: Tab navigasi untuk memisahkan data antara Tompobulu, Biringbulu, dan Bungaya.
- **QR Code Verification**: Setiap tugas dilengkapi dengan QR Code unik untuk kemudahan tracking.
- **Photo Evidence**: Fitur unggah foto bukti pengiriman/tugas langsung dari dashboard.
- **Spreadsheet Integration**: Data ditarik secara dinamis dari Google Sheets sebagai sumber data utama.
- **High-End UI/UX**: Antarmuka bersih dengan tema warna khas SPX Express, responsif untuk mobile dan desktop.

## 🚀 Teknologi

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **AI**: Google Gemini API (Gemini 2.5/3 Series)
- **Icons**: Lucide React
- **Data Parsing**: PapaParse (CSV)
- **Deployment**: Vercel

## 🛠️ Instalasi Lokal

1. Clone repository:
   ```bash
   git clone https://github.com/Ndiioo/SPX-Assigment-Task.git
   ```
2. Install dependensi:
   ```bash
   npm install
   ```
3. Set up environment variable:
   Buat file `.env` dan tambahkan API Key Gemini Anda:
   ```env
   API_KEY=your_gemini_api_key_here
   ```
4. Jalankan aplikasi:
   ```bash
   npm run dev
   ```

## 📄 Lisensi

Proyek ini dibuat untuk tujuan tugas internal SPX. Seluruh aset merek dagang adalah milik **Shopee Xpress**.

---
Developed with ❤️ by Senior Frontend Team.
