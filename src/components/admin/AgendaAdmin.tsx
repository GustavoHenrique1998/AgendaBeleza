"use client";
// src/components/admin/AgendaAdmin.tsx
// Passo 5 — Agenda do dia (linha do tempo, uma coluna por profissional)
//
// Espera GET /api/admin/agenda?date=YYYY-MM-DD retornando:
// {
//   inicioMin: 540, fimMin: 1140,                      // faixa visível (09:00–19:00)
//   resumo: { total, faturamentoEstimadoCents, concluidos, clientes },
//   profissionais: [{
//     id, name,
//     bloqueios: [{ id, startMin, endMin, reason }],   // folgas/almoço
//     agendamentos: [{ id, startMin, endMin, status, clientName, servicos: string[], totalCents }]
//   }]
// }
// Mudança de status: PATCH /api/admin/appointments/:id/status { status }

import { useCallback, useEffect, useState } from "react";

type Status = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

type Agendamento = {
  id: string;
  startMin: number;
  endMin: number;
  status: Status;
  clientName: string;
  servicos: string[];
  totalCents: number;
};
type Bloqueio = { id: string; startMin: number; endMin: number; reason?: string };
type ProfAgenda = { id: string; name: string; bloqueios: Bloqueio[]; agendamentos: Agendamento[] };
type AgendaDia = {
  inicioMin: number;
  fimMin: number;
  resumo: { total: number; faturamentoEstimadoCents: number; concluidos: number; clientes: number };
  profissionais: ProfAgenda[];
};

const PX_POR_HORA = 72;
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const STATUS_INFO: Record<Status, { label: string; cor: string }> = {
  PENDING: { label: "Pendente", cor: "bg-amber-100 border-amber-400 text-amber-900" },
  CONFIRMED: { label: "Confirmado", cor: "bg-sky-100 border-sky-400 text-sky-900" },
  COMPLETED: { label: "Concluído", cor: "bg-emerald-100 border-emerald-400 text-emerald-900" },
  CANCELLED: { label: "Cancelado", cor: "bg-neutral-100 border-neutral-300 text-neutral-500 line-through" },
  NO_SHOW: { label: "Falta", cor: "bg-red-100 border-red-400 text-red-900" },
};

export default function AgendaAdmin() {
  const [data, setData] = useState(hojeISO());
  const [agenda, setAgenda] = useState<AgendaDia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<Agendamento | null>(null);
  const [mostrarCancelados, setMostrarCancelados] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch(`/api/admin/agenda?date=${data}`);
    setAgenda(r.ok ? await r.json() : null);
    setCarregando(false);
  }, [data]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function mudarStatus(id: string, status: Status) {
    const r = await fetch(`/api/admin/appointments/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const corpo = await r.json().catch(() => ({}));
      alert(corpo.error ?? "Não foi possível alterar o status.");
    }
    setSelecionado(null);
    carregar();
  }

  const inicio = agenda?.inicioMin ?? 540;
  const fim = agenda?.fimMin ?? 1140;
  const altura = ((fim - inicio) / 60) * PX_POR_HORA;
  const topo = (m: number) => ((m - inicio) / 60) * PX_POR_HORA;
  const horas = Array.from({ length: Math.ceil((fim - inicio) / 60) + 1 }, (_, i) => inicio + i * 60);
  const dataExtenso = new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });

  return (
    <div className="mx-auto max-w-7xl p-3 sm:p-6">
      {/* Navegação de data */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex w-full items-center justify-between gap-2 md:w-auto md:flex-1">
          <button onClick={() => setData(somaDias(data, -1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-lg font-medium text-zinc-700 transition hover:bg-zinc-200 active:scale-95" aria-label="Dia anterior">←</button>
          <label className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 text-center text-sm font-medium text-zinc-800 shadow-sm transition hover:border-zinc-300 md:max-w-xs">
            <span className="mr-2 text-base">📅</span>
            <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} className="w-full bg-transparent text-center text-sm text-zinc-800 outline-none" />
          </label>
          <button onClick={() => setData(somaDias(data, 1))} className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-lg font-medium text-zinc-700 transition hover:bg-zinc-200 active:scale-95" aria-label="Próximo dia">→</button>
        </div>
        <h1 className="ml-1 text-lg font-semibold capitalize">{dataExtenso}</h1>
        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-600">
          <input type="checkbox" checked={mostrarCancelados} onChange={(e) => setMostrarCancelados(e.target.checked)} />
          Mostrar cancelados
        </label>
        <a href="/admin/agendamentos?novo=1" className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white">
          + Novo agendamento
        </a>
      </div>

      {/* Cards-resumo */}
      {agenda && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { t: "Agendamentos", v: agenda.resumo.total },
            { t: "Faturamento estimado", v: brl(agenda.resumo.faturamentoEstimadoCents) },
            { t: "Concluídos", v: agenda.resumo.concluidos },
            { t: "Clientes do dia", v: agenda.resumo.clientes },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border bg-white p-3 shadow-sm">
              <p className="text-xs text-neutral-500">{c.t}</p>
              <p className="text-xl font-semibold">{c.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Legenda */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {(Object.keys(STATUS_INFO) as Status[]).map((s) => (
          <span key={s} className={`rounded-full border px-2 py-0.5 no-underline ${STATUS_INFO[s].cor.replace("line-through", "")}`}>
            {STATUS_INFO[s].label}
          </span>
        ))}
      </div>

      {carregando && <p className="text-neutral-500">Carregando agenda…</p>}
      {!carregando && !agenda && <p className="text-red-600">Não foi possível carregar a agenda.</p>}
      {!carregando && agenda && agenda.profissionais.length === 0 && (
        <p className="rounded-xl bg-neutral-50 p-6 text-center text-neutral-600">Nenhum profissional trabalha neste dia.</p>
      )}

      {/* Linha do tempo: rola na horizontal no celular */}
      {agenda && agenda.profissionais.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <div className="flex min-w-max">
            {/* coluna de horas */}
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r bg-white">
              <div className="h-11 border-b" />
              <div className="relative" style={{ height: altura }}>
                {horas.map((h) => (
                  <span key={h} className="absolute -translate-y-2 pr-2 text-right text-xs text-neutral-400" style={{ top: topo(h), right: 0 }}>
                    {hhmm(h)}
                  </span>
                ))}
              </div>
            </div>

            {/* uma coluna por profissional */}
            {agenda.profissionais.map((p) => (
              <div key={p.id} className="w-56 shrink-0 border-r last:border-r-0 sm:w-64">
                <div className="flex h-11 items-center justify-center border-b bg-neutral-50 px-2 font-medium">{p.name}</div>
                <div className="relative" style={{ height: altura }}>
                  {/* linhas de hora */}
                  {horas.map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-neutral-100" style={{ top: topo(h) }} />
                  ))}

                  {/* bloqueios / almoço */}
                  {p.bloqueios.map((b) => (
                    <div
                      key={b.id}
                      className="absolute inset-x-0 flex items-center justify-center bg-[repeating-linear-gradient(45deg,#f5f5f5,#f5f5f5_6px,#ebebeb_6px,#ebebeb_12px)] text-xs text-neutral-500"
                      style={{ top: topo(b.startMin), height: topo(b.endMin) - topo(b.startMin) }}
                    >
                      {b.reason ?? "Indisponível"}
                    </div>
                  ))}

                  {/* agendamentos */}
                  {p.agendamentos
                    .filter((a) => mostrarCancelados || a.status !== "CANCELLED")
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelecionado(a)}
                        className={`absolute inset-x-1 overflow-hidden rounded-lg border-l-4 p-1.5 text-left text-xs shadow-sm transition hover:brightness-95 ${STATUS_INFO[a.status].cor}`}
                        style={{ top: topo(a.startMin) + 1, height: Math.max(topo(a.endMin) - topo(a.startMin) - 2, 24) }}
                      >
                        <p className="truncate font-semibold">
                          {hhmm(a.startMin)}–{hhmm(a.endMin)} · {a.clientName}
                        </p>
                        <p className="truncate opacity-80">{a.servicos.join(", ")}</p>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Painel de detalhes / mudança de status (bottom sheet no celular) */}
      {selecionado && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setSelecionado(null)}>
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{selecionado.clientName}</h2>
                <p className="text-sm text-neutral-500">
                  {hhmm(selecionado.startMin)}–{hhmm(selecionado.endMin)} · {brl(selecionado.totalCents)}
                </p>
              </div>
              <button onClick={() => setSelecionado(null)} aria-label="Fechar" className="p-1 text-xl">×</button>
            </div>
            <p className="mb-4 text-sm">{selecionado.servicos.join(" · ")}</p>
            <p className="mb-2 text-xs font-medium uppercase text-neutral-500">Alterar status</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(STATUS_INFO) as Status[]).map((s) => (
                <button
                  key={s}
                  disabled={selecionado.status === s}
                  onClick={() => mudarStatus(selecionado.id, s)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium disabled:opacity-40 ${STATUS_INFO[s].cor.replace("line-through", "")}`}
                >
                  {STATUS_INFO[s].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
