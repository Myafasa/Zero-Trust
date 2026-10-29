# Sistem Nilai — Zero Trust Security 

Tiga aplikasi Node.js + Express, satu database SQLite bersama:

| Komponen | Port | Peran NIST | File utama |
|---|---|---|---|
| API Gateway | 3000 | PEP + Policy Engine/Administrator | `gateway/` |
| Service Nilai | 3001 | Resource | `service-nilai/index.js` |
| Service Transkrip | 3002 | Resource | `service-transkrip/index.js` |

## Menjalankan
```bash
npm install
npm run setup     # membuat .env berisi secret acak
npm run seed      # membuat DB + data awal
npm start         # menjalankan 3 aplikasi sekaligus
npm test          # uji end-to-end (jam akses harus terbuka, lihat di bawah)
npm run audit     # 30 catatan terakhir
```
Butuh Node.js 18+ (untuk `fetch` bawaan).

## Akun seed (password semua: `password123`)
| username | role | NIM | X-Device-ID |
|---|---|---|---|
| admin1 | admin | - | DEV-ADMIN-001 |
| dosen1 | dosen (kelas IF101, id 1) | - | DEV-DOSEN-001 |
| dosen2 | dosen (kelas IF102, id 2) | - | DEV-DOSEN-002 |
| mhs1 | mahasiswa | 247001001 | DEV-MHS-001 |
| mhs2 | mahasiswa | 247001002 | DEV-MHS-002 |
| mhs3 | mahasiswa | 247001003 | DEV-MHS-003 |

## Jam akses (demo)
Atur di `.env`: `ACCESS_HOUR_START` / `ACCESS_HOUR_END` (jam lokal `ACCESS_TZ`, default 7 dan 21).
- Demo deny: `ACCESS_HOUR_START=3` `ACCESS_HOUR_END=3` (selalu di luar jam), restart.
- Demo allow / menjalankan `npm test`: `ACCESS_HOUR_START=0` `ACCESS_HOUR_END=24`.

## Contoh curl
```bash
curl -s -X POST localhost:3000/auth/login -H 'Content-Type: application/json' \
  -H 'X-Device-ID: DEV-DOSEN-001' -d '{"username":"dosen1","password":"password123"}'

curl -s localhost:3000/nilai -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-DOSEN-001'
curl -s -X PUT localhost:3000/nilai/1 -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-DOSEN-001' \
  -H 'Content-Type: application/json' -d '{"nilai":90}'
curl -s -X POST localhost:3000/kelas/1/finalisasi -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-DOSEN-001'

# bypass gateway -> ditolak
curl -i localhost:3001/nilai
```

## Peta kebutuhan -> kode (untuk video demo)
| Kebutuhan | Lokasi |
|---|---|
| 4.1 Access token 10 mnt, `sub` + `role` | `gateway/tokens.js` (`signAccess`) |
| 4.1 Refresh token 1 hari, di DB, dicabut saat logout | `gateway/tokens.js` (`issueRefresh`), `gateway/authRoutes.js` (`/refresh`, `/logout`), tabel `refresh_tokens` |
| 4.1 Token service 5 mnt (`POST /auth/service`) | `gateway/authRoutes.js`, `service-nilai/index.js` (`getServiceToken`) |
| 4.1 Gateway secret | `gateway/index.js` (`proxyReq`), `shared/guard.js` |
| 4.1 Verifikasi ulang token di service | `shared/guard.js` |
| 4.2 Kebijakan akses + baca DB | `gateway/policy.js` |
| 4.3 Device terdaftar | `gateway/pep.js` (langkah 2), `gateway/authRoutes.js` (login) |
| 4.3 Jam akses | `shared/time.js`, `gateway/policy.js` |
| 4.4 Audit log | `gateway/audit.js`, dipanggil di `pep.js` dan `authRoutes.js` |
| Sinkron transkrip via gateway | `service-nilai/index.js` (`/kelas/:id/finalisasi`), `service-transkrip/index.js` |

## Catatan keamanan
- JWT HS256 dengan algoritma dikunci saat verifikasi; secret terpisah untuk access dan refresh token.
- Refresh token dirotasi; pemakaian ulang token lama mencabut semua sesi user.
- Service Transkrip mencocokkan data sinkron dengan DB (harus sudah `final` dan nilainya sama).
- Jika sinkron gagal, finalisasi dikembalikan ke `draft`.
- Audit ditulis sebelum request diteruskan; jika gagal menulis, request tidak diteruskan.
- Keterbatasan: access token yang sudah terbit tetap berlaku sampai 10 menit setelah logout (karena JWT stateless). Pengembangan lanjut: RS256 (service hanya pegang public key), rate limiting login.
