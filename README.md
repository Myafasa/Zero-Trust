# Sistem Nilai dengan Zero Trust Security

Tugas Praktikum Individu **Zero Trust Security**
Keamanan Informasi (KP70065004) · Informatika · Universitas Siliwangi

Penyusun: Fadhel Mohamad Syarushiam (NPM 247006111074)

Sistem Nilai yang menerapkan prinsip *never trust, always verify*, *least privilege*, dan *assume breach* langsung di level aplikasi, mengikuti arsitektur NIST SP 800-207: API Gateway sebagai Policy Enforcement Point (PEP) yang terpisah dari service.

---

## Arsitektur

```
Client (Postman)
        |  Authorization: Bearer <token>  +  X-Device-ID
        v
+---------------------------------------------+
| API Gateway :3000  (PEP + Policy Engine)    |---> Audit Log (tabel audit_log)
| /auth/*  /nilai/*  /kelas/*  /transkrip/*   |
+---------------------------------------------+
     | allow + X-Gateway-Secret      | allow + X-Gateway-Secret
     v                               v
+-----------------+          +--------------------+
| Service Nilai   |  token   | Service Transkrip  |
| :3001           |--------->| :3002              |
| (via gateway)   | service  |                    |
+-----------------+          +--------------------+
            \                      /
             +---- Database SQLite (bersama) ----+
```

| Komponen | Port | Peran (NIST SP 800-207) | Lokasi kode |
|---|---|---|---|
| API Gateway | 3000 | PEP + Policy Engine / Administrator | `gateway/` |
| Service Nilai | 3001 | Resource | `service-nilai/` |
| Service Transkrip | 3002 | Resource | `service-transkrip/` |
| Database | - | Resource (SQLite, `better-sqlite3`) | `db/`, `shared/db.js` |
| Audit Log | - | Data source (tabel `audit_log`) | `gateway/audit.js` |

Satu-satunya pintu masuk adalah gateway. Panggilan antar-service (Service Nilai ke Service Transkrip saat finalisasi) juga **melalui gateway** memakai token service.

---

## Cara menjalankan

### Prasyarat
- Node.js **18 atau lebih baru** (disarankan versi LTS, misalnya 22).
- Git.
- Tidak perlu Docker atau server database.

### Langkah

```bash
# 1. Salin repository dan masuk ke foldernya
git clone <url-repository>
cd <nama-folder>

# 2. Pasang dependensi
npm install

# 3. Buat file .env berisi secret acak
npm run setup

# 4. Buat database dan isi data awal (user, device, kelas, nilai)
npm run seed

# 5. Jalankan ketiga aplikasi sekaligus
npm start
```

Jika berhasil, terminal menampilkan tiga log:

```
[gateway] PEP + Policy Engine di :3000
[nilai] Service Nilai di :3001
[transkrip] Service Transkrip di :3002
```

Catatan:
- `npm run seed` **menghapus dan membuat ulang** seluruh tabel (termasuk audit log). Hentikan server terlebih dahulu (Ctrl+C) sebelum menjalankannya, lalu jalankan `npm start` lagi.
- Setiap service juga bisa dijalankan terpisah: `npm run start:gateway`, `npm run start:nilai`, `npm run start:transkrip`.
- Semua perubahan pada `.env` baru berlaku setelah ketiga aplikasi di-restart.

---

## Daftar akun dan device ID data awal

**Password semua akun: `password123`**

Setiap user memiliki tepat satu device terdaftar. Header `X-Device-ID` wajib dikirim pada login dan pada semua request user lainnya.

| username | Role | NIM | X-Device-ID |
|---|---|---|---|
| `admin1` | admin | - | `DEV-ADMIN-001` |
| `dosen1` | dosen (mengampu IF101) | - | `DEV-DOSEN-001` |
| `dosen2` | dosen (mengampu IF102) | - | `DEV-DOSEN-002` |
| `mhs1` | mahasiswa | `247001001` | `DEV-MHS-001` |
| `mhs2` | mahasiswa | `247001002` | `DEV-MHS-002` |
| `mhs3` | mahasiswa | `247001003` | `DEV-MHS-003` |

**Kredensial Service Nilai** (untuk `POST /auth/service`): `client_id` = `service-nilai`, `client_secret` = nilai `SERVICE_CLIENT_SECRET` di `.env`.

---

## Data awal kelas dan nilai

Dua kelas dengan dosen pengampu berbeda. Ketiga mahasiswa terdaftar di kedua kelas. Semua nilai awal berstatus `draft`.

| ID kelas | Kode | Mata kuliah | Dosen pengampu |
|---|---|---|---|
| 1 | IF101 | Basis Data | dosen1 |
| 2 | IF102 | Keamanan Informasi | dosen2 |

| ID nilai | Mahasiswa | Kelas | Nilai awal |
|---|---|---|---|
| 1 | mhs1 | IF101 | 85 |
| 2 | mhs1 | IF102 | 78 |
| 3 | mhs2 | IF101 | 72 |
| 4 | mhs2 | IF102 | 90 |
| 5 | mhs3 | IF101 | 64 |
| 6 | mhs3 | IF102 | 81 |

Id user (dipakai di audit log, bagian subjek): admin1 = 1, dosen1 = 2, dosen2 = 3, mhs1 = 4, mhs2 = 5, mhs3 = 6.

---

## Daftar endpoint dan kebijakan

Semua endpoint diakses lewat gateway (`http://localhost:3000`). Selain `/auth/*`, setiap request user wajib membawa access token yang valid dan `X-Device-ID` yang terdaftar.

| Endpoint | Diproses oleh | Diizinkan | Kondisi |
|---|---|---|---|
| `POST /auth/login` | Gateway | Semua user | Kredensial valid dan device terdaftar |
| `POST /auth/refresh` | Gateway | Semua user | Refresh token valid, belum dicabut, device sama dengan sesi. Token dirotasi |
| `POST /auth/logout` | Gateway | Semua user | Refresh token valid dan belum dicabut |
| `POST /auth/service` | Gateway | Service Nilai | Client ID dan secret valid |
| `GET /nilai` | Service Nilai | Mahasiswa, dosen | Mahasiswa: hanya nilai miliknya. Dosen: hanya kelas yang diampu |
| `PUT /nilai/:id` | Service Nilai | Dosen | Kelas yang diampu, nilai belum final, dalam jam akses |
| `POST /kelas/:id/finalisasi` | Service Nilai | Dosen | Kelas yang diampu dan dalam jam akses. Lalu sinkron ke transkrip |
| `GET /transkrip/:nim` | Service Transkrip | Mahasiswa, admin | Mahasiswa: hanya NIM sendiri. Admin: semua NIM |
| `POST /transkrip/sinkron` | Service Transkrip | Service Nilai | Hanya token service. Token user mana pun ditolak |

Body login: `{"username":"...","password":"..."}`. Body refresh dan logout: `{"refresh_token":"..."}`. Body ubah nilai: `{"nilai": 0-100}`.

---

## Memeriksa audit log

```bash
npm run audit                 # 30 catatan terakhir
npm run audit -- 60           # 60 catatan terakhir
npm run audit -- 60 deny      # hanya yang ditolak (atau: allow)
npm run audit -- summary      # ringkasan jumlah per hasil dan alasan
```

Atau lewat SQL di `db/nilai.sqlite`:

```sql
SELECT id, waktu, subjek, endpoint, device, hasil, alasan
FROM audit_log ORDER BY id DESC LIMIT 40;
```

Kolom:

| Kolom | Isi |
|---|---|
| `waktu` | Waktu keputusan (ISO 8601, UTC) |
| `subjek` | `user:<id>(<role>)`, `service:<client_id>`, `login:<username>`, atau `anonymous` |
| `endpoint` | `METHOD /path` |
| `device` | Nilai `X-Device-ID` (kosong untuk service) |
| `hasil` | `allow` atau `deny` |
| `alasan` | Penjelasan keputusan |

Akses langsung ke port 3001 atau 3002 tidak tercatat, karena request itu tidak melewati gateway. Penolakannya terlihat dari respons 403 service.

---

## Struktur folder

```
.
├── gateway/
│   ├── index.js         # server gateway dan proxy ke service
│   ├── pep.js           # Policy Enforcement Point
│   ├── policy.js        # Policy Engine (aturan allow/deny)
│   ├── authRoutes.js    # login, refresh, logout, token service
│   ├── tokens.js        # penerbitan JWT
│   └── audit.js         # penulisan audit log
├── service-nilai/index.js
├── service-transkrip/index.js
├── shared/
│   ├── config.js        # konfigurasi dari .env
│   ├── db.js            # koneksi SQLite bersama
│   ├── guard.js         # gateway secret + verifikasi token di service
│   └── time.js          # pengecekan jam akses
├── db/
│   ├── schema.sql       # skema tabel
│   └── seed.js          # data awal
├── scripts/
│   ├── setup-env.js     # membuat .env
│   └── audit.js         # menampilkan audit log
├── postman/             # koleksi dan environment Postman
├── test/e2e.js          # uji end-to-end
├── .env.example
└── package.json
```

Tabel database: `users`, `devices`, `kelas`, `nilai`, `transkrip`, `refresh_tokens`, `service_clients`, `audit_log`.