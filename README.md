# DesignrHub-BE

DesignrHub-BE adalah layanan backend untuk platform DesignrHub, yang menyediakan endpoint API untuk manajemen pengguna, autentikasi, manajemen langganan, pemrosesan pembayaran, dan manajemen konten. Platform ini bertujuan untuk menyediakan dan mengelola akses bersama ke berbagai akun premium aplikasi desain populer.

## Fitur Utama

-   Autentikasi pengguna (pendaftaran, login, verifikasi email, reset kata sandi, logout).
-   Manajemen Akun Admin.
-   **Manajemen Paket Langganan**: Pembuatan, pembaruan, dan penghapusan paket langganan yang disinkronkan sebagai "Produk" di Polar.sh.
-   **Manajemen Voucher/Diskon**: Pembuatan, pembaruan, dan penghapusan voucher diskon yang disinkronkan sebagai "Discounts" di Polar.sh, termasuk pengaturan batasan tanggal, batas penggunaan, dan restriksi produk.
-   **Pemrosesan Pembayaran melalui Polar.sh**:
    -   Inisiasi sesi checkout Polar.sh untuk pembelian paket.
    -   Penanganan webhook dari Polar.sh untuk status pembayaran (`checkout.session.completed`, `order.paid`, dll.) dan pembaruan langganan pengguna.
    -   Semua transaksi terkait Polar.sh menggunakan mata uang default Polar (diasumsikan USD).
-   Manajemen Pelanggan di Polar.sh: Pembuatan dan pembaruan data pelanggan di Polar.sh saat pengguna mendaftar atau melakukan transaksi, menggunakan `external_id` untuk sinkronisasi.
-   Manajemen Kategori Aplikasi.
-   Manajemen Tipe Aplikasi (layanan desain yang ditawarkan).
-   Manajemen Item/Akun Layanan (detail akun premium yang dibagikan).
-   Pencatatan Aktivitas Pengguna dan Sistem.
-   Sinkronisasi manual Paket dan Voucher lokal dengan Produk dan Diskon di Polar.sh (endpoint admin).

## Teknologi

-   Node.js
-   Express.js
-   MongoDB dengan Mongoose
-   Autentikasi JWT (JSON Web Token)
-   **Polar.sh SDK (`@polar-sh/sdk`)**: Untuk interaksi dengan API Polar.sh (Produk, Harga, Diskon, Checkout, Pelanggan, Webhook).
-   **Polar.sh Express Adapter (`@polar-sh/express`)**: (Opsional, namun direkomendasikan) Untuk kemudahan integrasi Checkout dan Webhook Polar.sh dengan Express.
-   Nodemailer untuk layanan email.
-   Multer untuk unggah file.
-   Middleware keamanan: Compression, Helmet, express-mongo-sanitize, xss-clean, express-rate-limit.
-   Manajemen variabel environment dengan `dotenv`.
-   Logging dengan `morgan` dan pencatatan error kustom.

## Prasyarat

-   Node.js (v16.x atau lebih baru direkomendasikan, periksa dokumentasi Polar SDK untuk versi Node yang didukung)
-   MongoDB (v4.x atau lebih baru)
-   npm atau yarn (atau pnpm jika Anda menggunakannya untuk instalasi paket Polar)
-   Akun Polar.sh yang aktif (Sandbox untuk development, Production untuk live)

## Instalasi

1.  Clone repositori:
    ```bash
    git clone [https://github.com/ReacteevID/DesignrHub-BE.git](https://github.com/ReacteevID/DesignrHub-BE.git)
    cd DesignrHub-BE
    ```

2.  Instal dependensi:
    ```bash
    npm install
    # Jika Anda memutuskan menggunakan pnpm untuk paket Polar tertentu:
    # pnpm install @polar-sh/sdk @polar-sh/express zod 
    # (atau gunakan npm/yarn untuk semua)
    ```

3.  Buat file `.env` di direktori root berdasarkan file `.env.example` (jika ada) atau buat baru.

4.  Perbarui file `.env` dengan detail konfigurasi Anda (lihat bagian Variabel Lingkungan).

## Variabel Lingkungan

Pastikan file `.env` Anda memiliki variabel-variabel berikut, terutama yang berkaitan dengan Polar.sh:

```dotenv
# Konfigurasi Server
PORT=3876
NODE_ENV=development # Ubah ke 'production' untuk mode produksi

# Konfigurasi Database
MONGO_URI=mongodb://localhost:27017/designrhub_db # Ganti dengan URI MongoDB Anda

# Konfigurasi JWT
JWT_SECRET=kunci_rahasia_jwt_super_aman_anda_disini

# Konfigurasi Email (Contoh untuk Gmail)
EMAIL_USERNAME=akunemailanda@gmail.com
EMAIL_PASSWORD=passwordaplikasiemailanda # Gunakan App Password jika 2FA aktif

# Konfigurasi URL Aplikasi
BE_URL=http://localhost:3876/ # URL Backend Anda
FE_URL=http://localhost:3000/ # URL Frontend Anda (untuk redirect pembayaran, dll.)

# --- Konfigurasi Polar.sh ---
# Dapatkan dari dashboard Polar.sh Anda (Settings -> API Access)
POLAR_ACCESS_TOKEN=pak_xxxxxxxxx_xxxxxxxxxxxx # Token akses Polar Anda (live atau sandbox)
POLAR_WEBHOOK_SECRET=whsec_xxxxxxxxx_xxxxxxxxxxxx # Rahasia Webhook dari endpoint yang Anda buat di Polar

# (Opsional, jika POLAR_ACCESS_TOKEN tidak secara otomatis scoped ke satu organisasi)
# POLAR_ORGANIZATION_ID=org_xxxxxxxx_xxxxxxxx # ID Organisasi Polar Anda

# Variabel untuk mengizinkan pembuatan produk gratis di Polar (jika diperlukan)
# ALLOW_FREE_PRODUCTS=false 
