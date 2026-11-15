# Workspace Projects

Platform aplikasi kantor berbasis modul. Modul pertama: **Booking Ruangan**.

| Branch | Fungsi |
|---|---|
| `main` | Planning dan dokumen keputusan |
| `dev` | Development dan tes (tidak live) |
| `prod` | Produksi (ter-deploy ke Cloudflare) |

- [`docs/PLANNING.md`](docs/PLANNING.md): keputusan alur.
- [`docs/SETUP.md`](docs/SETUP.md): menjalankan lokal dan deploy.

## Struktur

```
apps/api          API (Hono di Cloudflare Workers, D1)
apps/web          Web (React + Vite)
packages/shared   Tipe dan konstanta bersama
scripts           Tes alur terhadap server lokal
```
