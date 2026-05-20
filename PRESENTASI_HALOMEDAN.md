# 🗺️ HaloMedan: Sistem Perbandingan Algoritma Navigasi Kota Medan
Dokumen ini disusun sebagai panduan lengkap untuk kebutuhan presentasi proyek aplikasi **HaloMedan**.

---

## 📋 1. Ringkasan Proyek (Project Overview)
**HaloMedan** adalah aplikasi navigasi interaktif berbasis web (GIS - *Geographic Information System*) yang dirancang khusus untuk memvisualisasikan dan membandingkan kinerja tiga algoritma pencarian rute terpendek: **Uniform Cost Search (UCS)**, **A\* (A-Star)**, dan **Hill Climbing**. 

Aplikasi ini menggunakan jaringan jalan raya asli Kota Medan yang ditarik secara real-time dari data satelit peta dunia terbuka.

---

## 🛠️ 2. Arsitektur & Teknologi (Tech Stack)
Aplikasi ini dibangun menggunakan arsitektur modern yang memisahkan logika backend yang berat dengan visualisasi frontend yang interaktif secara mulus:

*   **Backend (Laravel)**: Mengatur API, validasi data, *caching* koordinat, serta menjalankan logika komputasi ketiga algoritma pencarian rute ([RouteService.php](file:///c:/laragon/www/HaloMedan/app/Services/RouteService.php)).
*   **Frontend (React.js & Inertia.js)**: Menyajikan antarmuka pengguna (UI) yang premium dengan *sidebar* interaktif, animasi simulasi mobil berjalan, dan kartu hasil perbandingan performa.
*   **Peta Interaktif (Leaflet.js & OpenStreetMap)**: Berperan sebagai kanvas visual untuk menampilkan peta Kota Medan, penanda titik (*markers*), serta menggambar garis rute jalan raya.
*   **Mesin Navigasi (OSRM - Open Source Routing Machine)**: Digunakan untuk menyuplai data persimpangan (*nodes*) dan segmen jalan raya (*edges*) asli Kota Medan secara dinamis.
*   **Pencarian Tempat (Nominatim & Photon API)**: API pencarian nama tempat (*geocoding*) untuk menerjemahkan input teks pengguna menjadi koordinat Latitude & Longitude riil.

---

## 💡 3. Fitur Utama Aplikasi
1.  **Pencarian Lokasi Cerdas (Smart Search)**: Dilengkapi dengan fitur pencocokan otomatis (*autocomplete*) untuk mencari jalan, gedung, atau landmark di seluruh Kota Medan.
2.  **Deteksi GPS Real-Time**: Aplikasi mendeteksi lokasi fisik pengguna secara otomatis untuk dijadikan titik awal keberangkatan (*Start*).
3.  **Pembuatan Graf Dinamis (OSRM)**: Saat rute dicari, sistem akan secara otomatis membuat jaringan jalan (graf) di memori server berdasarkan area jalan raya Medan yang dilewati.
4.  **Sistem Cadangan Graf Statis (Database Fallback)**: Jika pengguna sedang offline atau API peta sedang terganggu, sistem akan beralih ke data database statis ([GraphSeeder.php](file:///c:/laragon/www/HaloMedan/database/seeders/GraphSeeder.php)) yang berisi 19 titik landmark penting Medan (seperti USU, Lapangan Merdeka, Stadion Teladan, Sun Plaza, dll.).
5.  **Simulasi Demo Navigasi**: Animasi ikon mobil yang berjalan menyusuri rute terpilih dari start hingga tujuan untuk mempermudah pemahaman alur navigasi.
6.  **Komparator Performa**: Kartu hasil yang membandingkan performa algoritma secara *side-by-side* berdasarkan metrik Jarak, Waktu Tempuh Komputasi, dan Jumlah Persimpangan yang Diperiksa.

---

## 🧮 4. Analisis & Cara Kerja 3 Algoritma

Aplikasi membandingkan 3 algoritma dengan karakteristik pendekatan yang berbeda:

### A. Uniform Cost Search (UCS)
*   **Kategori**: *Uninformed Search* (Pencarian Buta).
*   **Cara Kerja**: Algoritma ini berjalan dari titik awal dengan cara mengeksplorasi jalan-jalan di sekelilingnya secara memutar (*expanding outward*) berdasarkan biaya akumulasi jarak terpendek ($g(n)$). Ia menggunakan min-priority queue untuk selalu mengekstrak jalan dengan jarak total paling kecil.
*   **Kelebihan**: Dijamin 100% selalu menemukan rute paling terpendek/optimal.
*   **Kelemahan**: Komputasinya berat dan tidak efisien karena harus memeriksa banyak persimpangan jalan yang arahnya berlawanan dengan tujuan (*nodes visited* tinggi).

### B. A* (A-Star) Search
*   **Kategori**: *Informed Search* (Pencarian Terbimbing).
*   **Cara Kerja**: Menggabungkan biaya jarak tempuh nyata dari start ($g(n)$) dengan fungsi perkiraan jarak udara ke tujuan ($h(n)$) menggunakan rumus matematika **Haversine**. Persamaan utamanya adalah $f(n) = g(n) + h(n)$. 
*   **Kelebihan**: Hasil rutenya dijamin 100% optimal (sama dengan UCS), namun proses pencariannya jauh lebih cepat dan terarah karena "dipandu" oleh jarak udara ke tujuan.
*   **Kelemahan**: Membutuhkan perhitungan matematika tambahan di setiap titik (Haversine).

### C. Hill Climbing (Steepest Ascent)
*   **Kategori**: *Local Search / Greedy* (Pencarian Lokal).
*   **Cara Kerja**: Algoritma serakah yang sangat sederhana. Di setiap persimpangan jalan, ia akan melihat pilihan jalan di depannya dan **hanya memilih satu jalan yang jarak udaranya paling mendekatkan diri ke tujuan**. Ia tidak memiliki memori untuk mundur kembali (*no backtracking*).
*   **Kelebihan**: Sangat cepat dan hampir tidak memakan memori komputer.
*   **Kelemahan**: Sering gagal (*get stuck*) jika menemui jalan buntu atau jika rute mengharuskan kendaraan memutar arah menjauhi tujuan untuk sementara waktu (kejadian *Lokal Optimum*).

---

## 📊 5. Parameter Pengujian (Metrik Evaluasi)
Ketika mempresentasikan aplikasi ini, berikut adalah 3 metrik utama yang digunakan untuk menguji performa algoritma:

1.  **Jarak Rute (km)**:
    *   *UCS & A\** : Selalu menghasilkan angka terkecil yang sama (misal: 6.71 km) karena keduanya terbukti optimal secara matematis.
    *   *Hill Climbing* : Sering kali menghasilkan jarak yang lebih panjang atau berstatus **GAGAL**.
2.  **Titik Dilalui / Nodes Visited (Jumlah Persimpangan yang Diperiksa)**:
    *   Menunjukkan efisiensi pencarian di server. 
    *   *A\** akan selalu memeriksa titik lebih sedikit (misal: 48 titik) dibanding *UCS* (misal: 60 titik) karena A* bergerak terfokus ke arah tujuan, sedangkan UCS menyebar ke segala arah.
3.  **Waktu Komputasi (ms)**:
    *   Waktu yang dibutuhkan server Laravel untuk menyelesaikan perhitungan matematika dari start ke goal (biasanya di bawah 1 milidetik).

---

## 🏁 6. Kesimpulan untuk Presentasi
*   **A\*** adalah algoritma terbaik untuk sistem navigasi jalan raya karena berhasil mengkombinasikan keakuratan rute 100% milik **UCS** dengan efisiensi pencarian cepat milik **Hill Climbing**.
*   **UCS** terlalu memboroskan sumber daya komputasi server untuk peta skala besar.
*   **Hill Climbing** tidak layak digunakan secara mandiri untuk navigasi jalan raya komersial karena tingginya tingkat kegagalan akibat masalah lokal optimum di tata kota jalanan yang kompleks.
