import { useEffect, useMemo, useState } from "react";
import { MAX_PARTICIPANTS, type PersonDto } from "@app/shared";
import { api } from "../api";

// Daftar orang jarang berubah selama satu kunjungan halaman, jadi dibaca sekali.
let cache: Promise<PersonDto[]> | null = null;
export function usePeople(): PersonDto[] | null {
  const [people, setPeople] = useState<PersonDto[] | null>(null);
  useEffect(() => {
    cache ??= api<{ people: PersonDto[] }>("GET", "/rooms/people").then((r) => r.people);
    cache.then(setPeople).catch(() => {
      cache = null;
      setPeople([]);
    });
  }, []);
  return people;
}

/** Memilih peserta dari pengguna di PT yang sama. Pemesan tidak ditawarkan. */
export function PeoplePicker({ value, onChange, excludeId, id }: { value: string[]; onChange: (ids: string[]) => void; excludeId: string; id?: string }) {
  const people = usePeople();
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const term = q.trim().toLowerCase();
  const matches = term
    ? (people ?? []).filter((p) => p.id !== excludeId && !value.includes(p.id) && p.name.toLowerCase().includes(term)).slice(0, 6)
    : [];
  const full = value.length >= MAX_PARTICIPANTS;

  const add = (pid: string) => {
    onChange([...value, pid]);
    setQ("");
  };

  return (
    <div className="people">
      {value.length > 0 && (
        <div className="chips">
          {value.map((pid) => (
            <span key={pid} className="chip">
              {byId.get(pid)?.name ?? "…"}
              <button type="button" aria-label={`Hapus ${byId.get(pid)?.name ?? "peserta"}`} onClick={() => onChange(value.filter((x) => x !== pid))}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        value={q}
        disabled={full || !people}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Enter memilih hasil pertama, bukan mengirim form.
            e.preventDefault();
            if (matches[0]) add(matches[0].id);
          }
        }}
        placeholder={!people ? "Memuat daftar orang…" : full ? `Maksimal ${MAX_PARTICIPANTS} peserta` : "Ketik nama untuk menambah peserta"}
        autoComplete="off"
      />
      {term && (
        <div className="people-results" role="listbox">
          {matches.length ? (
            matches.map((p) => (
              <button type="button" role="option" aria-selected={false} key={p.id} onClick={() => add(p.id)}>
                + {p.name}
              </button>
            ))
          ) : (
            <span className="small muted">Tidak ada nama yang cocok.</span>
          )}
        </div>
      )}
    </div>
  );
}

export const peopleText = (list: PersonDto[]) => (list.length ? list.map((p) => p.name).join(", ") : "Belum ada");
