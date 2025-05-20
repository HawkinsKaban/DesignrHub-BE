]# DesignrHub-BE
\
DesignrHub-BE adalah layanan backend untuk platform DesignrHub, yang menyediakan endpoint API untuk manajemen pengguna, autentikasi,\
pemrosesan pembayaran, dan manajemen konten.

## Fitur

- Autentikasi pengguna (pendaftaran, masuk, reset kata sandi)
- Manajemen admin
- Manajemen paket dan langganan
- Pemrosesan pembayaran (melalui Tripay)
- Manajemen kategori dan item
- Sistem voucher
- Pencatatan aktivitas pengguna

## Teknologi

- Node.js
- Express.js
- MongoDB dengan Mongoose
- Autentikasi JWT
- Nodemailer untuk layanan email
- Multer untuk unggah file
- Compression, Helmet, dan middleware keamanan lainnya

## Prasyarat

- Node.js (v16.x atau lebih baru)
- MongoDB (v4.x atau lebih baru)
- npm atau yarn

## Instalasi

1. Clone repositori:
   ```
   git clone https://github.com/ReacteevID/DesignrHub-BE.git
   cd DesignrHub-BE
   ```

2. Instal dependensi:
   ```
   npm install
   ```

3. Buat file `.env` di direktori root berdasarkan file `.env.example`:
   ```
   cp .env.example .env
   ```

4. Perbarui file `.env` dengan detail konfigurasi Anda.

## Variabel Lingkungan

Buat file `.env` dengan variabel-variabel berikut:

```
# Konfigurasi Server
PORT=3876
NODE_ENV=development

# Konfigurasi Database
MONGO_URI=mongodb://localhost:27017/designrhub_db

# Konfigurasi JWT
JWT_SECRET=kunci_rahasia_jwt_anda_disini

# Konfigurasi Email
EMAIL_USERNAME=email_anda@gmail.com
EMAIL_PASSWORD=password_aplikasi_anda_disini

# Konfigurasi URL
BE_URL=http://localhost:3876/
FE_URL=http://localhost:3000/

# Gateway Pembayaran (Tripay)
TRIPAY_API_KEY=kunci_api_tripay_anda
TRIPAY_PRIVATE_KEY=kunci_pribadi_tripay_anda
TRIPAY_MERCHANT_CODE=kode_merchant_tripay_anda
TRIPAY_URL=https://tripay.co.id/api/
```

## Menjalankan Server

### Mode Pengembangan

```
npm run dev
```

Ini akan memulai server dengan nodemon, yang secara otomatis memulai ulang ketika Anda melakukan perubahan pada kode.

### Mode Produksi

```
npm start
```

## Endpoint API

### Autentikasi

- `POST /be/api/auth/register` - Mendaftarkan pengguna baru
- `POST /be/api/auth/login` - Masuk sebagai pengguna
- `GET /be/api/auth/verify/:token` - Verifikasi email pengguna
- `POST /be/api/auth/request-forgot-password` - Permintaan reset kata sandi
- `POST /be/api/auth/logout` - Keluar sebagai pengguna

### Manajemen Pengguna

- `GET /be/api/user` - Mendapatkan semua pengguna (hanya admin)
- `GET /be/api/user/:id` - Mendapatkan pengguna berdasarkan ID (hanya admin)
- `POST /be/api/user/create` - Membuat pengguna baru (hanya admin)
- `DELETE /be/api/user/:id` - Menghapus pengguna (hanya admin)
- `PATCH /be/api/user/:id` - Memperbarui informasi pengguna (hanya admin)
- `PATCH /be/api/user/subscription/:id` - Memperbarui langganan pengguna (hanya admin)
- `GET /be/api/user/profile/dashboard` - Mendapatkan dashboard profil pengguna

### Manajemen Admin

- `POST /be/api/admin/login` - Masuk sebagai admin
- `POST /be/api/admin/register` - Mendaftarkan admin baru

### Kategori

- `GET /be/api/category/getAll` - Mendapatkan semua kategori
- `POST /be/api/category/create` - Membuat kategori baru
- `PUT /be/api/category/update/:id` - Memperbarui kategori
- `DELETE /be/api/category/delete/:id` - Menghapus kategori

### Paket

- `PUT /be/api/packages/update/:id` - Memperbarui paket
- `POST /be/api/packages/create` - Membuat paket baru
- `GET /be/api/packages/list` - Mendapatkan semua paket
- `DELETE /be/api/packages/delete/:id` - Menghapus paket

### Item

- `POST /be/api/item/create` - Membuat item baru
- `GET /be/api/item/find` - Mendapatkan semua item
- `PUT /be/api/item/update/:id` - Memperbarui item
- `DELETE /be/api/item/delete/:id` - Menghapus item

### Tipe

- `POST /be/api/type/create` - Membuat tipe baru
- `GET /be/api/type/` - Mendapatkan semua tipe
- `PUT /be/api/type/:id` - Memperbarui tipe
- `DELETE /be/api/type/:id` - Menghapus tipe

### Voucher

- `POST /be/api/vouchers/create` - Membuat voucher baru
- `GET /be/api/vouchers/list` - Mendapatkan semua voucher
- `PUT /be/api/vouchers/:id` - Memperbarui voucher
- `DELETE /be/api/vouchers/:id` - Menghapus voucher

### Pembayaran

- `GET /be/api/payments/getAll` - Mendapatkan semua pembayaran
- `GET /be/api/payments/get/:id` - Mendapatkan pembayaran berdasarkan ID
- `POST /be/api/payments/create` - Membuat pembayaran baru
- `POST /be/api/payments/callback` - Handler callback pembayaran

### Log

- `GET /be/api/log/getAll` - Mendapatkan semua log
- `GET /be/api/log/get/:id` - Mendapatkan log berdasarkan ID
- `GET /be/api/log/user` - Mendapatkan log untuk pengguna saat ini

## Pencatatan Error

Error dicatat ke `./tmp/error-logs.txt`. Pastikan direktori `tmp` ada dan dapat ditulis.

## Lisensi

Proyek ini dilisensikan di bawah Lisensi MIT - lihat file [LICENSE](LICENSE) untuk detailnya.