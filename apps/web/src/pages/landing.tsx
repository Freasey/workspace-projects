import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../api";
import { Brand } from "../components/ui";

const at = (a: number, b: number): CSSProperties => ({ gridColumn: `${a} / ${b}` });

/** Halaman utama publik: pengenalan aplikasi, lalu jalan masuk ke /login. */
export function Landing() {
  const { me } = useAuth();
  const appPath = me ? (me.kind === "superadmin" ? "/admin" : "/rooms") : "/login";
  const appLabel = me ? "Buka aplikasi" : "Masuk";

  return (
    <div className="landing">
      <header className="lp-nav">
        <div className="lp-wrap">
          <Brand />
          <nav aria-label="Bagian halaman">
            <a href="#fitur">Fitur</a>
            <a href="#mulai">Cara mulai</a>
            <a href="#mobile">Aplikasi mobile</a>
          </nav>
          <Link className="lp-btn" to={appPath}>{appLabel}</Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div>
            <span className="lp-eyebrow">Aplikasi kantor berbasis modul</span>
            <h1>Ruang rapat selalu jelas siapa yang pakai, dan kapan.</h1>
            <p>
              Spaces adalah aplikasi untuk urusan internal kantor. Modul pertamanya, Booking Ruangan,
              menampilkan jadwal semua ruangan dalam satu layar dan menolak booking yang bentrok.
            </p>
            <div className="lp-cta">
              <Link className="lp-btn solid" to={appPath}>{appLabel}</Link>
              <a className="lp-btn ghost" href="#fitur">Lihat fitur</a>
            </div>
          </div>
          <div className="lp-shot" aria-hidden="true">
            <div className="lp-shot-head"><span>Senin, 16 November</span><i>+ Booking</i></div>
            {[
              ["Ruang Rapat Utama", [[5, 11, ""], [21, 29, ""]]],
              ["Ruang Diskusi", [[2, 6, ""], [9, 17, ""], [31, 35, "o"]]],
              ["Pod Fokus", [[13, 16, ""], [25, 41, ""]]],
            ].map(([name, bars]) => (
              <div className="lp-shot-row" key={name as string}>
                <span>{name as string}</span>
                <div>{(bars as [number, number, string][]).map(([a, b, c]) => <i key={a} className={c} style={at(a, b)} />)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="fitur">
        <div className="lp-wrap">
          <h2>Yang dikerjakan Booking Ruangan</h2>
          <div className="lp-features">
            <article>
              <h3>Jadwal dalam satu layar</h3>
              <p>Ruangan tersusun ke bawah, jam ke samping. Ruangan mana yang kosong dan jam berapa terlihat tanpa membuka satu per satu.</p>
            </article>
            <article>
              <h3>Booking dengan klik atau seret</h3>
              <p>Seret di area kosong dari jam mulai sampai jam selesai, tulis judul, simpan. Slot berukuran 15 menit.</p>
            </article>
            <article>
              <h3>Tidak ada booking ganda</h3>
              <p>Bentrok dicegah di database. Kalau dua orang menyimpan jam yang sama pada saat bersamaan, hanya satu yang diterima.</p>
            </article>
            <article>
              <h3>Aturan milik tiap perusahaan</h3>
              <p>Admin mengatur jam buka, jam istirahat, tanggal tutup, durasi maksimal, dan seberapa jauh ke depan ruangan boleh dibooking.</p>
            </article>
            <article>
              <h3>Penolakan yang menjelaskan</h3>
              <p>Booking yang ditolak selalu menyebut aturannya, misalnya "Ruangan ini istirahat 12.00–13.00".</p>
            </article>
            <article>
              <h3>Akun dan jejak aktivitas</h3>
              <p>Admin perusahaan mengelola user dan perannya sendiri. Perubahan penting tercatat di log aktivitas.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section alt" id="mulai">
        <div className="lp-wrap">
          <h2>Cara mulai memakai</h2>
          <ol className="lp-steps">
            <li>
              <h3>Perusahaan didaftarkan</h3>
              <p>Pengelola Spaces mendaftarkan perusahaan Anda dan membuat akun admin pertama. Tiap perusahaan punya data dan zona waktunya sendiri.</p>
            </li>
            <li>
              <h3>Admin menyiapkan ruangan dan user</h3>
              <p>Perusahaan baru sudah berisi beberapa ruangan contoh. Admin menyesuaikannya, mengatur jadwal, lalu menambahkan karyawan.</p>
            </li>
            <li>
              <h3>Karyawan mulai booking</h3>
              <p>Karyawan masuk dengan email dan password dari admin, lalu memesan ruangan langsung dari jadwal.</p>
            </li>
          </ol>
          <p className="lp-note">Akun tidak bisa dibuat sendiri dari halaman ini. Minta akun ke admin perusahaan Anda.</p>
        </div>
      </section>

      <section className="lp-section" id="mobile">
        <div className="lp-wrap lp-mobile">
          <div>
            <h2>Aplikasi Android dan iOS</h2>
            <p>
              Aplikasi mobile sedang disiapkan dan akan memakai akun serta data yang sama dengan versi web.
              Setelah rilis, tautan unduhnya tersedia di halaman ini.
            </p>
            <div className="lp-stores">
              <span className="lp-store" aria-disabled="true"><strong>Android</strong><small>Segera hadir</small></span>
              <span className="lp-store" aria-disabled="true"><strong>iOS</strong><small>Segera hadir</small></span>
            </div>
            <p className="lp-note">Sementara itu, Spaces bisa dibuka dari browser ponsel. Di layar kecil, jadwal tampil sebagai daftar per ruangan.</p>
          </div>
          <div className="lp-phone" aria-hidden="true">
            <b>Senin, 16 Nov</b>
            <div><strong>Ruang Rapat Utama</strong><span>09.00–10.30 · Rapat mingguan tim</span></div>
            <div><strong>Ruang Diskusi</strong><span>13.00–14.00 · Diskusi proyek</span></div>
            <div><strong>Pod Fokus</strong><span>Belum ada booking</span></div>
            <i>+ Booking</i>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <Brand />
          <Link to={appPath}>{appLabel}</Link>
        </div>
      </footer>
    </div>
  );
}
