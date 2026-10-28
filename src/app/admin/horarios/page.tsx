"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { hhmmParaMinutos, minutosParaHHMM } from "@/lib/datas";
import { Alerta, btnPrimary, inputCls } from "@/components/ui";

type Dia = {
  weekday: number;
  isOpen: boolean;
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
};
type Dados = { salao: Dia[]; profissionais: { id: string; name: string; dias: Dia[] }[] };

const NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ORDEM = [1, 2, 3, 4, 5, 6, 0]; // semana começando na segunda

const semanaPadrao = (): Dia[] =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isOpen: weekday >= 1 && weekday <= 6,
    startMin: 8 * 60,
    endMin: 18 * 60,
    breakStartMin: weekday >= 1 && weekday <= 6 ? 12 * 60 : null,
    breakEndMin: weekday >= 1 && weekday <= 6 ? 13 * 60 : null,
  }));

export default function HorariosPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [escopo, setEscopo] = useState<string>("SALAO"); // "SALAO" ou id do profissional
  const [dias, setDias] = useState<Dia[]>(semanaPadrao());
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    api<Dados>("/api/admin/schedules")
      .then((resposta) => {
        const dadosNormalizados: Dados = {
          salao: resposta?.salao?.length ? resposta.salao : semanaPadrao(),
          profissionais: (resposta?.profissionais ?? []).map((p) => ({
            ...p,
            dias: p.dias?.length ? p.dias : semanaPadrao(),
          })),
        };
        setDados(dadosNormalizados);
      })
      .catch((e) => setMsg({ tipo: "erro", texto: e.message }));
  }, []);
  useEffect(carregar, [carregar]);

  useEffect(() => {
    if (!dados) return;
    const origem = escopo === "SALAO" ? dados.salao : dados.profissionais.find((p) => p.id === escopo)?.dias ?? [];
    setDias(origem.map((d) => ({ ...d })));
  }, [dados, escopo]);

  const mudar = (weekday: number, patch: Partial<Dia>) =>
    setDias((atual) => atual.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      await api("/api/admin/schedules", {
        method: "PUT",
        body: JSON.stringify({ professionalId: escopo === "SALAO" ? null : escopo, dias }),
      });
      setMsg({ tipo: "ok", texto: "Horários salvos." });
      carregar();
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e.message });
    }
    setSalvando(false);
  }

  const hora = (min: number | null) => (min === null ? "" : minutosParaHHMM(min));

  return (
    <main className="mx-auto max-w-4xl p-3 sm:p-6">
      <h1 className="mb-1 text-2xl font-semibold">Horários de Atendimento</h1>
      <p className="mb-4 text-sm text-neutral-600">
        O horário de cada profissional vale dentro do expediente do salão. Dias desmarcados são folga.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={escopo} onChange={(e) => setEscopo(e.target.value)} className={`${inputCls} !w-auto`}>
          <option value="SALAO">Salão (expediente geral)</option>
          {dados?.profissionais.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <ul className="space-y-2">
        {ORDEM.map((wd) => {
          const d = dias.find((x) => x.weekday === wd);
          if (!d) return null;
          return (
            <li key={wd} className={`rounded-xl border bg-white p-3 ${d.isOpen ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex w-32 items-center gap-2 font-medium">
                  <input type="checkbox" checked={d.isOpen} onChange={(e) => mudar(wd, { isOpen: e.target.checked })} className="h-5 w-5" />
                  {NOMES[wd]}
                </label>
                {d.isOpen ? (
                  <>
                    <span className="flex items-center gap-1 text-sm">
                      Das
                      <input type="time" value={hora(d.startMin)} onChange={(e) => e.target.value && mudar(wd, { startMin: hhmmParaMinutos(e.target.value) })} className={`${inputCls} !w-auto`} />
                      às
                      <input type="time" value={hora(d.endMin)} onChange={(e) => e.target.value && mudar(wd, { endMin: hhmmParaMinutos(e.target.value) })} className={`${inputCls} !w-auto`} />
                    </span>
                    <span className="flex items-center gap-1 text-sm">
                      Almoço
                      <input
                        type="time"
                        value={hora(d.breakStartMin)}
                        onChange={(e) => mudar(wd, { breakStartMin: e.target.value ? hhmmParaMinutos(e.target.value) : null, ...(e.target.value ? {} : { breakEndMin: null }) })}
                        className={`${inputCls} !w-auto`}
                      />
                      às
                      <input
                        type="time"
                        value={hora(d.breakEndMin)}
                        onChange={(e) => mudar(wd, { breakEndMin: e.target.value ? hhmmParaMinutos(e.target.value) : null })}
                        className={`${inputCls} !w-auto`}
                      />
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-neutral-500">Folga</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-3">
        {msg && <Alerta tipo={msg.tipo}>{msg.texto}</Alerta>}
        <button onClick={salvar} disabled={salvando || !dados} className={btnPrimary}>
          {salvando ? "Salvando…" : "Salvar horários"}
        </button>
      </div>
    </main>
  );
}
