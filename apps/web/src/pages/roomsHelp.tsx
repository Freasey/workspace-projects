import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useUser } from "../api";

// Gambar di halaman ini adalah tiruan layar yang digambar dengan komponen yang sama
// dengan aplikasinya, jadi selalu mengikuti tampilan dan tema yang sedang dipakai.

const GRID: CSSProperties = { gridTemplateColumns: "repeat(40, minmax(0, 1fr))", backgroundSize: "10% 100%" };
const at = (a: number, b: number): CSSProperties => ({ gridColumn: `${a} / ${b}` });

function Figure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="fig">
      <div className="fig-body" aria-hidden="true">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function Hours() {
  return (
    <div className="tl-row head">
      <div className="tl-lab" />
      <div className="tl-track num" style={GRID}>
        {["08.00", "09.00", "10.00", "11.00", "12.00", "13.00", "14.00", "15.00", "16.00", "17.00"].map((h) => <span key={h}>{h}</span>)}
      </div>
    </div>
  );
}

function Row({ name, meta, children }: { name: string; meta: string; children?: ReactNode }) {
  return (
    <div className="tl-row">
      <div className="tl-lab"><strong>{name}</strong><span className="small muted">{meta}</span></div>
      <div className="tl-track static" style={GRID}>{children}</div>
    </div>
  );
}

const Ev = ({ c, title, who, cls = "" }: { c: [number, number]; title: string; who: string; cls?: string }) => (
  <span className={`tl-ev ${cls}`} style={at(...c)}>{title}<small>{who}</small></span>
);
const Fake = ({ label, value }: { label: string; value: string }) => (
  <div><span className="fake-label">{label}</span><span className="fake-input">{value}</span></div>
);
const Check = ({ on, children }: { on?: boolean; children: ReactNode }) => (
  <span className="fake-check"><i className={on ? "on" : ""} />{children}</span>
);

function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="card help" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function RoomsHelp() {
  const me = useUser();
  const isAdmin = me.user.role === "admin";
  const topics: [string, string][] = [
    ["jadwal", "Membaca jadwal"],
    ["booking", "Membuat booking"],
    ["ditolak", "Kalau booking ditolak"],
    ["batal", "Melihat dan membatalkan booking"],
    ["peserta", "Peserta booking"],
    ["status", "Status booking"],
    ["layar", "Layar ruangan"],
  ];
  if (isAdmin) topics.push(["ruangan", "Admin: data ruangan"], ["jam", "Admin: jadwal ruangan"], ["batasan", "Admin: batasan booking"], ["tab", "Admin: tab Simple dan Advanced"]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bantuan Booking Ruangan</h1>
          <div className="muted">Fungsi tiap fitur, dengan gambar dan contoh. Data di dalam gambar hanya contoh.</div>
        </div>
      </div>

      <nav className="card help-toc" aria-label="Daftar isi">
        {topics.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <Topic id="jadwal" title="Membaca jadwal">
        <p>
          <Link to="/rooms">Jadwal</Link> menampilkan semua ruangan untuk satu tanggal. Ruangan tersusun ke bawah dan jam ke samping.
          Tiap kolom adalah 1 jam dan berisi 4 slot 15 menit.
        </p>
        <Figure caption="Kotak berisi adalah booking. Kotak dengan garis tebal di kiri adalah booking Anda. Area bergaris miring tidak bisa dibooking. Garis merah adalah waktu sekarang.">
          <div className="tl">
            <Hours />
            <Row name="Ruang Rapat Utama" meta="12 orang · Lantai 2">
              <Ev c={[5, 11]} title="Rapat mingguan tim" who="Dewi Lestari" cls="mine" />
              <span className="tl-off" style={at(17, 21)}>Istirahat</span>
              <span className="tl-now" style={{ left: "31%" }} />
            </Row>
            <Row name="Ruang Diskusi" meta="6 orang · Lantai 2">
              <Ev c={[1, 5]} title="Stand-up" who="Rudi Hartono" cls="done" />
              <span className="tl-off" style={at(17, 21)}>Istirahat</span>
              <Ev c={[21, 25]} title="Diskusi proyek" who="Sinta Maharani" />
              <span className="tl-now" style={{ left: "31%" }} />
            </Row>
          </div>
        </Figure>
        <ul>
          <li><strong>Ganti tanggal</strong> dengan tombol ‹ dan ›, tombol Hari ini, atau kolom tanggal di sebelah judul.</li>
          <li><strong>Klik sebuah booking</strong> untuk melihat detailnya: ruangan, waktu, pemesan, dan catatan.</li>
          <li><strong>Baris bertuliskan Tutup</strong> berarti ruangan tidak buka pada hari itu, atau admin memasang tanggal tutup.</li>
          <li>Di ponsel, jadwal tampil sebagai daftar per ruangan dengan tombol Booking di tiap ruangan.</li>
        </ul>
      </Topic>

      <Topic id="booking" title="Membuat booking">
        <p>Ada tiga cara. Ketiganya membuka form yang sama.</p>
        <ol>
          <li><strong>Seret</strong> di area kosong pada baris ruangan, dari jam mulai sampai jam selesai.</li>
          <li><strong>Klik sekali</strong> di area kosong. Form terisi 1 jam mulai dari slot yang diklik.</li>
          <li>Tekan tombol <strong>+ Booking</strong> lalu pilih ruangan dan jam sendiri.</li>
        </ol>
        <Figure caption="Contoh: menyeret dari 13.00 sampai 14.30 di baris Ruang Diskusi mengisi form dengan ruangan dan jam itu. Anda tinggal menulis judul.">
          <div className="tl">
            <Hours />
            <Row name="Ruang Diskusi" meta="6 orang · Lantai 2">
              <Ev c={[5, 11]} title="Wawancara" who="Sinta Maharani" />
              <span className="tl-sel" style={at(21, 27)} />
            </Row>
          </div>
          <div className="fake-form">
            <Fake label="Ruangan" value="Ruang Diskusi (6 orang)" />
            <Fake label="Tanggal" value="Senin, 16 November 2026" />
            <Fake label="Mulai" value="13.00" />
            <Fake label="Selesai" value="14.30" />
            <Fake label="Judul" value="Review anggaran kuartal" />
          </div>
        </Figure>
        <ul>
          <li><strong>Judul</strong> wajib diisi dan terlihat oleh semua orang di PT Anda. Tulis yang jelas, misalnya "Review anggaran kuartal".</li>
          <li><strong>Catatan</strong> ada di tab Advanced pada form. Pakai untuk kebutuhan tambahan, misalnya "Butuh proyektor dan 8 kursi".</li>
          <li>Jam hanya bisa dipilih dalam kelipatan 15 menit.</li>
        </ul>
      </Topic>

      <Topic id="ditolak" title="Kalau booking ditolak">
        <p>Aplikasi memeriksa aturan saat Anda menekan Simpan. Kalau ditolak, pesannya selalu menyebut aturan yang dilanggar. Contoh:</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Yang Anda coba</th><th>Pesan yang muncul</th><th>Yang bisa dilakukan</th></tr></thead>
            <tbody>
              <tr><td>Jam 10.00–11.00, padahal sudah ada booking 09.00–10.30</td><td>Ruangan sudah dibooking pada jam itu.</td><td>Pilih jam atau ruangan lain</td></tr>
              <tr><td>Jam 07.00–08.00</td><td>Ruangan ini buka 08.00–18.00 pada hari Senin.</td><td>Geser ke dalam jam buka</td></tr>
              <tr><td>Jam 11.30–12.30 di ruangan yang istirahat siang</td><td>Ruangan ini istirahat 12.00–13.00.</td><td>Selesaikan sebelum 12.00 atau mulai 13.00</td></tr>
              <tr><td>Durasi 5 jam</td><td>Durasi maksimal untuk ruangan ini 4 jam.</td><td>Persingkat, atau pecah menjadi dua booking</td></tr>
              <tr><td>Tanggal 2 bulan lagi</td><td>Ruangan ini hanya bisa dibooking paling jauh 30 hari ke depan.</td><td>Booking lagi saat tanggalnya sudah dekat</td></tr>
              <tr><td>Hari Sabtu</td><td>Ruangan ini tutup pada hari Sabtu.</td><td>Pilih hari buka</td></tr>
              <tr><td>Jam yang sudah lewat</td><td>Waktu mulai sudah lewat.</td><td>Pilih jam setelah sekarang</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>Angka pada pesan mengikuti aturan PT Anda, jadi bisa berbeda dari contoh.</p>
      </Topic>

      <Topic id="batal" title="Melihat dan membatalkan booking">
        <p>
          <Link to="/rooms/mine">Booking saya</Link> berisi booking Anda yang akan datang dan riwayat 30 hari terakhir. Tekan Detail untuk membuka rinciannya.
        </p>
        <Figure caption="Tombol Batalkan booking hanya muncul selama booking belum mulai. Aplikasi meminta konfirmasi sekali lagi sebelum membatalkan.">
          <div className="fake-dialog">
            <strong className="fake-title">Review anggaran kuartal</strong>
            <dl>
              <dt>Ruangan</dt><dd>Ruang Diskusi</dd>
              <dt>Waktu</dt><dd>Senin, 16 November 2026, 13.00–14.30</dd>
              <dt>Pemesan</dt><dd>Dewi Lestari</dd>
              <dt>Status</dt><dd><span className="badge info">Terkonfirmasi</span></dd>
            </dl>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <span className="fake-btn danger">Batalkan booking</span><span className="fake-btn">Tutup</span>
            </div>
          </div>
        </Figure>
        <ul>
          <li>Anda bisa membatalkan booking Anda sendiri. Admin PT bisa membatalkan booking siapa pun.</li>
          <li>Booking yang sudah mulai tidak bisa dibatalkan.</li>
          <li>Setelah dibatalkan, slotnya langsung bisa dipakai orang lain.</li>
        </ul>
      </Topic>

      <Topic id="peserta" title="Peserta booking">
        <p>
          Saat membuat booking, ketik nama di isian <strong>Peserta</strong> untuk menambahkan rekan kerja dari perusahaan yang sama. Anda sebagai pemesan
          sudah otomatis ikut dan tidak perlu ditambahkan.
        </p>
        <ul>
          <li>Peserta bisa diubah lewat Detail booking (tombol Ubah) oleh pemesan atau admin PT, selama booking belum selesai.</li>
          <li>Kalau jumlah peserta ditambah pemesan melebihi kapasitas ruangan, form menampilkan peringatan. Booking tetap bisa disimpan.</li>
          <li>Daftar peserta tampil di layar ruangan saat booking berjalan atau akan dimulai.</li>
        </ul>
      </Topic>

      <Topic id="status" title="Status booking">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Status</th><th>Artinya</th></tr></thead>
            <tbody>
              <tr><td><span className="badge info">Terkonfirmasi</span></td><td>Ruangan terkunci untuk Anda pada jam itu.</td></tr>
              <tr><td><span className="badge">Selesai</span></td><td>Jam selesainya sudah lewat. Status ini berubah sendiri.</td></tr>
              <tr><td><span className="badge bad">Dibatalkan</span></td><td>Dibatalkan oleh pemesan atau admin PT, atau karena ruangan atau akun pemesan dinonaktifkan.</td></tr>
            </tbody>
          </table>
        </div>
      </Topic>

      <Topic id="layar" title="Layar ruangan">
        <p>
          Tablet atau HP yang dipasang di depan pintu bisa menjadi <strong>layar ruangan</strong>. Layar menampilkan status ruangan dengan warna yang
          terbaca dari jauh, jadwal hari ini, hitung mundur, dan daftar peserta.
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Warna</th><th>Artinya</th><th>Hitung mundur</th></tr></thead>
            <tbody>
              <tr><td><span className="badge bad">Sedang dipakai</span></td><td>Ada booking yang sedang berjalan.</td><td>Sampai booking berakhir</td></tr>
              <tr><td><span className="badge warn">Segera dipakai</span></td><td>Booking berikutnya mulai dalam 10 menit.</td><td>Sampai booking dimulai</td></tr>
              <tr><td><span className="badge ok">Tersedia</span></td><td>Ruangan buka dan kosong.</td><td>Sampai booking berikutnya</td></tr>
              <tr><td><span className="badge">Tutup</span></td><td>Di luar jam buka, jam istirahat, atau tanggal tutup.</td><td>Sampai booking berikutnya</td></tr>
            </tbody>
          </table>
        </div>
        <ol style={{ marginTop: 12 }}>
          <li>Admin PT membuka {isAdmin ? <Link to="/rooms/manage">Kelola ruangan</Link> : "Kelola ruangan"}, memilih ruangan, lalu menekan <strong>Buat kode pemasangan</strong> di bagian Layar ruangan.</li>
          <li>Di perangkat yang akan dipasang, buka alamat <strong>/layar</strong> di peramban, atau buka aplikasi Android lalu pilih <strong>Pasang sebagai layar ruangan</strong> di halaman masuk.</li>
          <li>Masukkan kode. Kode berlaku 15 menit dan hanya untuk satu perangkat.</li>
        </ol>
        <ul>
          <li>Layar tidak memakai akun siapa pun dan hanya bisa membaca jadwal satu ruangan. Admin bisa mencabutnya kapan saja dari Kelola ruangan.</li>
          <li>Layar memperbarui diri setiap 30 detik dan tetap menampilkan data terakhir kalau koneksi putus.</li>
          <li>Kalau modul dijeda, ruangan dinonaktifkan, atau perusahaan dihentikan, layar menampilkan "Tidak tersedia".</li>
        </ul>
      </Topic>

      {isAdmin && (
        <>
          <Topic id="ruangan" title="Admin: data ruangan">
            <p>
              Buka <Link to="/rooms/manage">Kelola ruangan</Link>. Isi nama, kapasitas, dan lokasi lalu tekan Tambah ruangan.
              Ruangan baru langsung mendapat jadwal Senin–Jumat 08.00–18.00 dan bisa dibooking.
            </p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Isian</th><th>Fungsi</th><th>Contoh</th></tr></thead>
                <tbody>
                  <tr><td>Nama</td><td>Tampil di jadwal dan di form booking</td><td>Ruang Rapat Utama</td></tr>
                  <tr><td>Kapasitas</td><td>Membantu user memilih ruangan yang cukup</td><td>12</td></tr>
                  <tr><td>Lokasi</td><td>Tampil di bawah nama ruangan</td><td>Lantai 2</td></tr>
                  <tr><td>Fasilitas (Advanced)</td><td>Daftar perlengkapan, dipisah koma</td><td>Proyektor, Papan tulis</td></tr>
                  <tr><td>Durasi maksimal ruangan ini (Advanced)</td><td>Menimpa aturan PT khusus untuk ruangan ini</td><td>2 jam untuk Pod Fokus</td></tr>
                  <tr><td>Booking paling jauh ruangan ini (Advanced)</td><td>Menimpa aturan PT khusus untuk ruangan ini</td><td>7 hari untuk ruang direksi</td></tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 12 }}>
              <strong>Nonaktifkan ruangan</strong> menyembunyikannya dari jadwal dan membatalkan semua booking mendatangnya. Riwayatnya tetap tersimpan, dan ruangan bisa diaktifkan lagi.
            </p>
            <p className="small muted">PT baru sudah berisi tiga ruangan dan dua booking berjudul "Contoh". Ubah, nonaktifkan, atau batalkan sesuai kebutuhan.</p>
          </Topic>

          <Topic id="jam" title="Admin: jadwal ruangan">
            <p>Jadwal menentukan kapan sebuah ruangan bisa dibooking. Pilih ruangan di Kelola ruangan, lalu atur di bagian Jadwal.</p>
            <Figure caption="Kiri: tab Simple, satu jam buka dan tutup untuk semua hari yang dicentang. Kanan: tab Advanced, jam bisa berbeda per hari dan bisa diberi jam istirahat.">
              <div className="fig-pair">
                <div className="fake-card">
                  <strong>Simple</strong>
                  <div className="row"><Check on>Sen</Check><Check on>Sel</Check><Check on>Rab</Check><Check on>Kam</Check><Check on>Jum</Check><Check>Sab</Check><Check>Min</Check></div>
                  <div className="fake-form two"><Fake label="Jam buka" value="08.00" /><Fake label="Jam tutup" value="18.00" /></div>
                </div>
                <div className="fake-card">
                  <strong>Advanced</strong>
                  <div className="fake-day"><Check on>Senin</Check><span>08.00–18.00</span><span>Istirahat 12.00–13.00</span></div>
                  <div className="fake-day"><Check on>Jumat</Check><span>08.00–16.30</span><span>Istirahat 11.30–13.00</span></div>
                  <div className="fake-day"><Check>Sabtu</Check><span className="muted">Tutup</span><span /></div>
                </div>
              </div>
            </Figure>
            <ul>
              <li><strong>Jam istirahat</strong> (Advanced): rentang di dalam jam buka yang tidak bisa dibooking. Contoh: 12.00–13.00.</li>
              <li><strong>Jeda antar-booking</strong> (Advanced): waktu kosong wajib di antara dua booking, misalnya 15 menit untuk merapikan ruangan.</li>
              <li><strong>Tanggal tutup</strong> (Advanced): satu tanggal tertentu ruangan tidak bisa dibooking, untuk ruangan ini atau semua ruangan. Contoh: libur nasional.</li>
              <li>Kalau jadwal dipersempit dan ada booking mendatang di luar jadwal baru, aplikasi menampilkan daftarnya sebelum menyimpan. Booking itu tidak dibatalkan otomatis.</li>
            </ul>
          </Topic>

          <Topic id="batasan" title="Admin: batasan booking">
            <p>Batasan berlaku untuk semua ruangan di PT Anda. Tiap ruangan bisa menimpanya lewat data ruangan di tab Advanced.</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Batasan</th><th>Fungsi</th><th>Contoh</th></tr></thead>
                <tbody>
                  <tr><td>Durasi maksimal</td><td>Lama terpanjang satu booking</td><td>4 jam: booking 09.00–14.00 ditolak</td></tr>
                  <tr><td>Booking paling jauh</td><td>Seberapa jauh ke depan boleh membooking</td><td>30 hari: tanggal 2 bulan lagi ditolak</td></tr>
                  <tr><td>Jarak minimal sebelum mulai (Advanced)</td><td>Booking harus dibuat paling lambat sekian waktu sebelum mulai</td><td>30 menit: pukul 09.45 tidak bisa membooking jam 10.00</td></tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 12 }}>Aturan yang diubah hanya berlaku untuk booking baru. Booking yang sudah ada tidak berubah.</p>
          </Topic>

          <Topic id="tab" title="Admin: tab Simple dan Advanced">
            <p>
              Data ruangan, Jadwal, dan Batasan booking masing-masing punya tab Simple dan Advanced sendiri. Mengganti tab di satu bagian tidak mengubah bagian lain, dan pilihan terakhir tiap bagian diingat.
            </p>
            <ul>
              <li>Kedua tab mengatur <strong>data yang sama</strong>. Advanced hanya menampilkan lebih banyak isian.</li>
              <li>Menyimpan dari tab Simple hanya mengubah isian yang tampil di Simple. Isian Advanced tidak tersentuh.</li>
              <li>Angka di samping tulisan Advanced adalah jumlah aturan Advanced yang sedang aktif di bagian itu.</li>
              <li>Kalau jadwal sebuah ruangan punya jam berbeda per hari atau jam istirahat, tab Simple menampilkan "Diatur di Advanced" beserta tombol untuk mengembalikannya ke bentuk simple.</li>
            </ul>
          </Topic>
        </>
      )}
    </>
  );
}
