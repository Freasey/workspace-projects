import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../api";
import { Brand } from "../components/ui";
import { ANDROID_RELEASE } from "../release";

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
        <div className="lp-wrap">
          <div className="lp-mobile">
            <div className="lp-mobile-copy">
              <span className="lp-eyebrow">Aplikasi mobile</span>
              <h2>Booking ruangan langsung dari ponsel.</h2>
              <p>
                Lihat jadwal semua ruangan, pesan slot kosong, dan batalkan booking dari mana saja. Akun dan datanya sama
                dengan versi web, jadi tidak perlu daftar lagi.
              </p>

              <div className="lp-get">
                <a className="lp-get-android" href={ANDROID_RELEASE.url} download>
                  <DownloadIcon />
                  <span>
                    <strong>Unduh untuk Android</strong>
                    <small>
                      Versi {ANDROID_RELEASE.version}
                      {ANDROID_RELEASE.sizeMb > 0 && ` · ${ANDROID_RELEASE.sizeMb} MB`} · Android {ANDROID_RELEASE.minAndroid} ke atas
                    </small>
                  </span>
                </a>
                <span className="lp-get-ios" aria-disabled="true">
                  <strong>iPhone</strong>
                  <small>Segera hadir</small>
                </span>
              </div>

              <details className="lp-install">
                <summary>Cara memasang di Android</summary>
                <ol>
                  <li>Ketuk <b>Unduh untuk Android</b> dari ponsel, lalu buka file yang selesai diunduh.</li>
                  <li>
                    Kalau muncul peringatan, pilih <b>Setelan</b> lalu izinkan <b>Instal aplikasi tidak dikenal</b> untuk browser
                    Anda. Aplikasi ini dipasang langsung dari situs Spaces, belum lewat Google Play.
                  </li>
                  <li>Buka Spaces dan masuk dengan email serta password yang sama seperti di web.</li>
                </ol>
              </details>
            </div>

            <div className="lp-mobile-visual">
              <PhoneMock />
              <div className="lp-qr">
                <img src="/download-qr.svg" alt="Kode QR untuk mengunduh aplikasi Android" width={92} height={92} />
                <span>
                  <strong>Sedang di komputer?</strong>
                  Pindai dengan kamera ponsel untuk mengunduh.
                </span>
              </div>
            </div>
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

const MOCK_DAYS = [["Sen", 16], ["Sel", 17], ["Rab", 18], ["Kam", 19], ["Jum", 20], ["Sab", 21], ["Min", 22]] as const;
const MOCK_ROOMS: { name: string; meta: string; bars: [number, number, string][]; item?: [string, string, string] }[] = [
  { name: "Ruang Rapat Utama", meta: "12 orang · Lantai 2", bars: [[10, 25, ""]], item: ["09.00–10.30", "Rapat mingguan tim", "Anda"] },
  { name: "Ruang Diskusi", meta: "6 orang · Lantai 2", bars: [[50, 60, "o"]], item: ["13.00–14.00", "Diskusi proyek", "Dewi Lestari"] },
  { name: "Pod Fokus", meta: "2 orang · Lantai 1", bars: [] },
];

/** Gambaran layar Jadwal di aplikasi mobile, disusun dengan HTML supaya ikut tema terang/gelap. */
function PhoneMock() {
  return (
    <div className="lp-device" aria-hidden="true">
      <div className="lp-device-screen">
        <div className="lp-m-top">
          <span className="lp-m-brand"><i /><i /><i /><i /></span>
          <b>Spaces</b>
          <small>PT Maju Bersama</small>
        </div>
        <div className="lp-m-date">
          <strong>Senin, 16 November</strong>
          <div className="lp-m-days">
            {MOCK_DAYS.map(([d, n], i) => (
              <span key={d} className={i === 0 ? "on" : undefined}><small>{d}</small>{n}</span>
            ))}
          </div>
        </div>
        <div className="lp-m-list">
          {MOCK_ROOMS.map((r) => (
            <div className="lp-m-card" key={r.name}>
              <div className="lp-m-card-head">
                <span><strong>{r.name}</strong><small>{r.meta}</small></span>
                <em>Booking</em>
              </div>
              <div className="lp-m-bar">
                {r.bars.map(([a, b, c]) => <i key={a} className={c} style={{ left: `${a}%`, width: `${b - a}%` }} />)}
              </div>
              {r.item ? (
                <div className={`lp-m-item${r.item[2] === "Anda" ? " mine" : ""}`}>
                  <b>{r.item[0]}</b>
                  <span><strong>{r.item[1]}</strong><small>{r.item[2]}</small></span>
                </div>
              ) : (
                <small className="lp-m-empty">Buka 08.00–18.00. Belum ada booking.</small>
              )}
            </div>
          ))}
        </div>
        <div className="lp-m-tabs">
          <span className="on"><i />Jadwal</span>
          <span><i />Booking saya</span>
          <span><i />Akun</span>
        </div>
      </div>
    </div>
  );
}
