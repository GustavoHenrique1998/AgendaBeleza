"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { brl } from "@/lib/formatar";
import { minutosParaHHMM } from "@/lib/datas";
import { StatusBadge, type Status, btnGhost, btnPrimary } from "@/components/ui";

type Resumo = { total: number; faturamentoEstimadoCents: number; concluidos: number; clientes: number };
type Linha = {
  id: string;
  startMin: number;
  endMin: number;
  status: Status;
  clientName: string;
  clientPhone?: string | null;
  professionalName: string;
  servicos: string[];
  totalCents: number;
};
type AgendaResposta = {
  date: string;
  resumo: Resumo;
  lista: Linha[];
  profissionais: Array<{ id: string; name: string; agendamentos: Linha[]; bloqueios: Array<{ id: string; startMin: number; endMin: number; reason?: string }> }>;
};
type DiaSemanal = {
  weekday: number;
  isOpen: boolean;
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
};
type CalendarioSemanalResposta = {
  salao: DiaSemanal[];
  profissionais: Array<{ id: string; name: string; dias: DiaSemanal[] }>;
};

const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const paraIsoLocal = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const gerarDiasPadrao = (isOpen = true): DiaSemanal[] =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isOpen,
    startMin: 540,
    endMin: 1080,
    breakStartMin: null,
    breakEndMin: null,
  }));

export default function DashboardPage() {
  const [dados, setDados] = useState<AgendaResposta | null>(null);
  const [semana, setSemana] = useState<CalendarioSemanalResposta | null>(null);
  const [filtroProfissional, setFiltroProfissional] = useState<string>("todos");
  const [selectedDate, setSelectedDate] = useState<string>(hojeLocal());
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregarDados = async (date = selectedDate) => {
    try {
      setCarregando(true);
      const [agenda, horarios] = await Promise.all([
        api<AgendaResposta>(`/api/admin/agenda?date=${date}`),
        api<CalendarioSemanalResposta>("/api/admin/schedules"),
      ]);
      setDados(agenda);
      setSemana(horarios);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados(selectedDate);
  }, [selectedDate]);

  const profissionais = dados?.profissionais ?? [];
  const listaFiltrada = useMemo(() => {
    if (!dados) return [];
    return dados.lista.filter((agendamento) =>
      filtroProfissional === "todos" ? true : agendamento.professionalName === profissionais.find((p) => p.id === filtroProfissional)?.name
    );
  }, [dados, filtroProfissional, profissionais]);

  const cards = dados && [
    { t: "Agendamentos do dia", v: dados.resumo.total },
    { t: "Faturamento estimado", v: brl(dados.resumo.faturamentoEstimadoCents) },
    { t: "Atendimentos concluídos", v: dados.resumo.concluidos },
    { t: "Clientes do dia", v: dados.resumo.clientes },
  ];

  const navegarData = (offset: number) => {
    const base = new Date(`${selectedDate}T12:00:00`);
    base.setDate(base.getDate() + offset);
    setSelectedDate(paraIsoLocal(base));
  };

  const waLink = (phone?: string | null) => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (!digits) return null;
    return `https://wa.me/55${digits.replace(/^55/, "")}`;
  };

  const atualizarStatus = async (id: string, status: Status) => {
    try {
      await api(`/api/admin/appointments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setDados((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lista: prev.lista.map((item) => (item.id === id ? { ...item, status } : item)),
        };
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível alterar o status.");
    }
  };

  const ajustarDisponibilidade = async (professionalId: string, disponivel: boolean) => {
    if (!semana) return;
    const prof = semana.profissionais.find((p) => p.id === professionalId);
    const hoje = new Date().getDay();
    const dias = prof?.dias ?? gerarDiasPadrao(disponivel);
    const semanaAtualizada = dias.map((dia) =>
      dia.weekday === hoje ? { ...dia, isOpen: disponivel } : dia
    );

    try {
      await api("/api/admin/schedules", {
        method: "PUT",
        body: JSON.stringify({
          professionalId,
          dias: semanaAtualizada,
        }),
      });
      setSemana((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          profissionais: prev.profissionais.map((p) =>
            p.id === professionalId ? { ...p, dias: semanaAtualizada } : p
          ),
        };
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar a disponibilidade.");
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-3 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-rose-600">Painel administrativo</p>
          <h1 className="text-2xl font-semibold text-neutral-900">Agenda do dia</h1>
        </div>
        <a href="/admin/agendamentos?novo=1" className={btnPrimary + " inline-flex items-center justify-center text-sm"}>
          + Novo agendamento
        </a>
      </div>

      {erro && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {carregando && !dados && <p className="text-neutral-500">Carregando painel…</p>}

      {cards && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.t} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">{card.t}</p>
              <p className="mt-2 text-2xl font-semibold text-neutral-900">{card.v}</p>
            </div>
          ))}
        </div>
      )}

      {dados && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => navegarData(-1)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-lg font-semibold text-neutral-700"
                aria-label="Dia anterior"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(hojeLocal())}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => navegarData(1)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700"
              >
                Amanhã
              </button>
              <button
                type="button"
                onClick={() => navegarData(1)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-lg font-semibold text-neutral-700"
                aria-label="Próximo dia"
              >
                ›
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 outline-none focus:border-rose-500"
                aria-label="Selecionar data"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setFiltroProfissional("todos")}
                className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium ${
                  filtroProfissional === "todos" ? "bg-rose-600 text-white" : "border border-neutral-200 bg-white text-neutral-700"
                }`}
              >
                Todos
              </button>
              {profissionais.map((profissional) => (
                <button
                  key={profissional.id}
                  type="button"
                  onClick={() => setFiltroProfissional(profissional.id)}
                  className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium ${
                    filtroProfissional === profissional.id ? "bg-rose-600 text-white" : "border border-neutral-200 bg-white text-neutral-700"
                  }`}
                >
                  {profissional.name}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {profissionais
                .filter((profissional) => profissional.id === filtroProfissional || filtroProfissional === "todos")
                .slice(0, 1)
                .map((profissional) => (
                  <div key={profissional.id} className="flex gap-2">
                    <button
                      type="button"
                      className={btnGhost + " text-sm"}
                      onClick={() => ajustarDisponibilidade(profissional.id, true)}
                    >
                      Disponível hoje
                    </button>
                    <button
                      type="button"
                      className={btnGhost + " text-sm"}
                      onClick={() => ajustarDisponibilidade(profissional.id, false)}
                    >
                      Bloquear/folga
                    </button>
                  </div>
                ))}
            </div>
          </div>

          <div className="space-y-3">
            {listaFiltrada.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
                Nenhum agendamento para este dia.
              </div>
            ) : (
              listaFiltrada.map((item) => {
                const wa = waLink(item.clientPhone);
                return (
                  <article key={item.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">Horário</p>
                        <p className="mt-1 text-xl font-semibold text-neutral-900">{minutosParaHHMM(item.startMin)}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold text-neutral-900">{item.clientName}</p>
                        <p className="text-xs text-neutral-500">{item.professionalName}</p>
                      </div>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-medium text-white"
                          aria-label={`Abrir WhatsApp de ${item.clientName}`}
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.servicos.map((servico) => (
                        <span key={`${item.id}-${servico}`} className="rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                          {servico}
                        </span>
                      ))}
                      <span className="rounded-full bg-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700">
                        {item.professionalName}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm text-neutral-600">
                      <span>Duração: {minutosParaHHMM(item.endMin - item.startMin)}</span>
                      <span>{brl(item.totalCents)}</span>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        className={btnPrimary + " flex-1 text-xs"}
                        onClick={() => atualizarStatus(item.id, "COMPLETED")}
                      >
                        Concluído
                      </button>
                      <button
                        type="button"
                        className={btnGhost + " flex-1 text-xs"}
                        onClick={() => atualizarStatus(item.id, "CANCELLED")}
                      >
                        Cancelar
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}
    </main>
  );
}
