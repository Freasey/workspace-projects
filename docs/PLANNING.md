# Planning

Dokumen ini mencatat keputusan alur yang sudah disepakati. Kode mengikuti dokumen ini; kalau keputusan berubah, dokumen ini diubah lebih dulu.

## 1. Gambaran

- Satu instalasi melayani banyak PT. Tiap PT memakai aplikasi untuk internalnya sendiri.
- Operator (super admin) mendaftarkan PT, menentukan modul yang didapat, dan bisa menjeda modul.
- Aplikasi terdiri dari banyak modul. Modul pertama adalah Booking Ruangan.
- Saat ini hanya versi web. Mobile menyusul dan cukup memakai API yang sama.

## 2. Stack

| Bagian | Pilihan |
|---|---|
| API | Hono di Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) + Drizzle |
| File | Cloudflare R2 (menyusul, untuk foto ruangan) |
| Web | React + Vite + TypeScript |
| Deploy | Satu Worker: `/api/*` ke API, sisanya file statis web |

Batasan tahap gratis yang memengaruhi desain:

- **Tanpa Postgres.** Anti-bentrok booking dijaga trigger SQLite.
- **10 ms CPU per request.** Hash password memakai PBKDF2 lewat WebCrypto.
- **Tanpa proses terjadwal.** Status yang bergantung waktu (selesai, kedaluwarsa, dilepas) dihitung saat data dibaca.

Semua aturan bisnis hidup di API, tidak di tampilan. API diberi versi (`/api/v1`).

## 3. Level pengguna

| Level | Siapa | Bisa apa |
|---|---|---|
| Super admin | Operator | Daftarkan PT, atur batas user, atur dan jeda modul, kelola user PT, buat kunci sekali pakai |
| Admin PT | Akun yang dibuat operator | Kelola user, ruangan, dan aturan booking di PT-nya |
| User | Karyawan PT | Memakai modul yang aktif |

## 4. Super admin

- Email dan password diambil dari variabel lingkungan `SUPERADMIN_EMAIL` dan `SUPERADMIN_PASSWORD`. Tidak disimpan di database.
- Sesi super admin diikat ke sidik jari kredensial itu. Kalau nilainya berubah, semua sesi lama gugur.
- Email super admin dicadangkan: tidak bisa dipakai user mana pun.
- Panel super admin terpisah dari aplikasi PT (`/admin`).
- Percobaan login dibatasi: 5 kali gagal, lalu jeda 15 menit.

## 5. PT dan user

- PT baru yang mendapat modul Booking Ruangan langsung berisi data contoh (3 ruangan dan 2 booking berjudul "Contoh" di hari kerja berikutnya), supaya layar pertamanya tidak kosong. Itu data biasa yang bebas diubah admin PT.
- Operator membuat PT beserta satu admin pertama. Password sementara diacak per akun, ditampilkan sekali, berlaku 7 hari, dan wajib diganti saat login pertama.
- Email unik di seluruh sistem; login cukup email dan password.
- Admin PT menambah user sampai **batas maksimal** yang ditentukan operator.
  - Yang dihitung hanya user aktif, termasuk admin.
  - Menurunkan batas di bawah jumlah saat ini tidak menghapus siapa pun; PT hanya tidak bisa menambah.
  - Batas juga berlaku saat operator yang menambah user.
- User dinonaktifkan, bukan dihapus. Booking mendatangnya dibatalkan, riwayat tetap ada.
- Admin terakhir sebuah PT tidak bisa dinonaktifkan atau diturunkan perannya.
- Reset password: user oleh admin PT, admin PT oleh operator. Tidak ada reset lewat email.
- Operator bisa mengelola user PT dari panel super admin. Perubahannya tercatat sebagai "pengelola sistem".
- Tiap PT punya zona waktu sendiri. Waktu disimpan dalam UTC.

## 6. Modul

Status modul per PT:

| Status | Yang dilihat user | Data |
|---|---|---|
| Aktif | Modul dipakai normal | Aman |
| Dijeda | Modul tampil dengan label "Dijeda", tidak bisa dibuka sama sekali | Aman, tidak disentuh |
| Tidak diberikan | Modul tidak tampil | Tidak ada |

- Jeda diperiksa di server pada setiap request.
- Booking yang ada tidak dibatalkan saat jeda. Yang waktunya lewat selama jeda dianggap kedaluwarsa.
- Halaman jeda menampilkan catatan dari operator.
- PT bisa di-suspend seluruhnya. User tetap bisa login tetapi hanya melihat pemberitahuan.
- PT diarsipkan dulu sebelum bisa dihapus permanen.

## 7. Kunci sekali pakai

Untuk operator masuk ke akun user tanpa meminta atau mereset password.

- Dibuat dari panel super admin, ditampilkan sekali, disimpan sebagai hash.
- **Universal**: berlaku untuk akun mana pun kecuali super admin.
- Berlaku 10 menit dan hangus setelah satu kali login berhasil.
- Hanya satu kunci aktif; membuat yang baru menghanguskan yang lama. Ada tombol hanguskan.
- Ikut hangus kalau kredensial super admin berubah.
- Sesi yang dihasilkan berumur 1 jam, ditandai, dan menampilkan banner.
- Di sesi itu ganti password dikunci, dan kewajiban ganti password dilewati.
- Tidak menembus modul yang dijeda, PT yang di-suspend, atau user nonaktif.
- Setiap pemakaian tercatat beserta akun yang dimasuki.

## 8. Modul Booking Ruangan

### Simple dan Advanced

Setiap layar pengaturan punya dua tab. Keduanya mengatur **data yang sama**; Advanced hanya menampilkan lebih banyak isian.

- Menyimpan dari tab Simple hanya menyentuh isian yang tampil di Simple.
- Isian Simple yang tidak bisa mewakili aturan Advanced ditampilkan terkunci ("Diatur di Advanced") dengan tombol kembalikan ke simple.
- Tab Advanced menampilkan jumlah aturan yang aktif.
- Tiap bagian (data ruangan, jadwal, batasan, form booking) punya tabnya sendiri. Mengganti tab di satu bagian tidak mengubah bagian lain.
- Tab terakhir diingat per admin dan per bagian.
- Tab Advanced selalu terbuka untuk semua PT.

| Proses | Tab Simple | Tab Advanced menambahkan |
|---|---|---|
| Jadwal ruangan | Centang hari, satu jam buka dan tutup | Jam berbeda per hari, jam istirahat, tanggal tutup, jeda antar-booking |
| Data ruangan | Nama, kapasitas, lokasi | Fasilitas, foto, akses per grup, wajib persetujuan |
| Batasan booking | Durasi maksimal, booking paling jauh | Jarak minimal, kuota per user, batas pembatalan, check-in dan auto-release |
| Form booking | Ruangan, tanggal, jam, judul | Booking berulang, jumlah peserta, catatan |
| Tambah user | Nama, email, peran | Grup, impor banyak |
| Laporan | Daftar booking | Utilisasi, jam sibuk, tingkat tidak datang |

Batasan booking diatur sekali untuk seluruh PT; tiap ruangan mewarisinya dan bisa menimpanya di tab Advanced.

### Aturan umum

- Slot kelipatan 15 menit.
- Bawaan: durasi maksimal 4 jam, booking paling jauh 30 hari, jam operasional Senin–Jumat 08.00–18.00.
- Anti-bentrok dijaga di database.
- Admin PT bisa membatalkan booking siapa pun.
- Pesan penolakan selalu menyebut aturannya.

### Status booking

Menunggu persetujuan → Terkonfirmasi → Check-in → Selesai, dengan cabang Ditolak, Dibatalkan, dan Dilepas (tidak datang). Tanpa fitur Advanced, hanya Terkonfirmasi → Selesai atau Dibatalkan.

### Kasus tepi

| Kasus | Perilaku |
|---|---|
| Pengajuan menunggu persetujuan | Slot terkunci untuknya |
| Penyetuju tidak merespons | Ditolak otomatis saat waktu mulai tiba |
| Wajib persetujuan dimatikan saat ada pengajuan menunggu | Pengajuan otomatis terkonfirmasi |
| Aturan diubah | Hanya berlaku untuk booking baru |
| Jadwal dipersempit | Booking terdampak ditampilkan sebelum disimpan |
| Booking berulang bentrok sebagian | Tanggal bentrok ditampilkan; user memilih lewati atau batal |
| Ruangan dinonaktifkan | Booking mendatangnya dibatalkan dengan notifikasi |
| Ruangan dilepas otomatis | Pemesan yang terlambat harus booking ulang |

## 9. Urutan pengerjaan

1. Fondasi: login, super admin, PT, user dan kuota, status modul, kunci sekali pakai, audit log.
2. Modul room dasar: ruangan, jadwal, batasan, booking, anti-bentrok.
3. Fitur Advanced: persetujuan, akses per grup, booking berulang, check-in dan auto-release, kuota per user.
4. Laporan, foto ruangan (R2), QR pintu.

## 10. Ide modul berikutnya

Peminjaman aset, booking kendaraan operasional, manajemen tamu, hot desk dan parkir, tiket fasilitas, pesanan konsumsi rapat, permintaan ATK, paket masuk. Aset, kendaraan, dan tamu memakai ulang mesin booking yang sama.

## 11. Tampilan

- Halaman utama (`/`) adalah landing page publik: pengenalan aplikasi dan tempat tautan unduh aplikasi Android dan iOS nanti. Form masuk ada di `/login`.
- Modul Booking Ruangan punya halaman Bantuan berisi fungsi tiap fitur dengan gambar dan contoh.
- Halaman masuk: panel merek di kiri, form di kanan. Tidak ada reset password lewat email; halaman hanya menjelaskan siapa yang bisa mereset.
- Setelah masuk: bar atas, sidebar modul yang selalu terlihat, area kerja di kanan. Di layar sempit sidebar menjadi baris menu di atas.
- Halaman awal modul Booking Ruangan adalah Jadwal: timeline dengan ruangan ke bawah dan jam ke samping, slot 15 menit. Booking dibuat dengan klik atau seret di area kosong. Di layar sempit timeline diganti daftar per ruangan.
- Modul yang dijeda tetap tampil di sidebar dengan label "Dijeda".
