// @ts-nocheck
"use client";
// src/components/cliente/AgendamentoCliente.tsx
// Passo 4 — Fluxo de agendamento do cliente (mobile-first, Tailwind)

import { useEffect, useMemo, useState } from "react";
import { buildWhatsappLink } from "@/lib/whatsapp";

type Servico = { id: string; name: string; description?: string | null; priceCents: number; durationMin: number };
type Categoria = { id: string; name: string; services: Servico[] };
type Profissional = { id: string; name: string; photoUrl?: string | null };

const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const duracao = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`;

function proximosDias(qtd = 90) {
  return Array.from({ length: qtd }, (_, i) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      iso,
      dia: d.getDate(),
      semana: d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      mes: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      completo: d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
    };
  });
}

const PASSOS = ["Serviços", "Profissional", "Data e hora", "Confirmar"];

export default function AgendamentoCliente() {
  const [passo, setPasso] = useState(0);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>("Todas");
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>("ANY");
  const [data, setData] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [horarios, setHorarios] = useState<string[]>([]);
  const [carregandoHorarios, setCarregandoHorarios] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);

  const dias = useMemo(() => proximosDias(90), []);
  const todosServicos = useMemo(() => categorias.flatMap((c) => c.services), [categorias]);
  const categoriasExibidas = categoriaAtiva === "Todas" ? categorias : categorias.filter((c) => c.name === categoriaAtiva);
  const servicosFiltrados = categoriasExibidas.flatMap((cat) => cat.services);
  const escolhidos = todosServicos.filter((s) => selecionados.includes(s.id));
  const total = escolhidos.reduce((s, x) => s + x.priceCents, 0);
  const minutos = escolhidos.reduce((s, x) => s + x.durationMin, 0);
  const selectedProfessional = profissionais.find((p) => p.id === selectedProfessionalId) ?? null;
  const selectedProfessionalParam = selectedProfessionalId && selectedProfessionalId !== "ANY" ? selectedProfessionalId : "ANY";
  const comprovanteLink = useMemo(() => {
    if (!data || !hora || !escolhidos.length) return null;
    return buildWhatsappLink({
      clientName: "Cliente",
      phone: null,
      date: data,
      time: hora,
      services: escolhidos.map((s) => s.name),
      professionalName: selectedProfessional?.name ?? "Profissional disponível",
      totalCents: total,
    }, process.env.NEXT_PUBLIC_SALAO_WHATSAPP ?? "5511999999999");
  }, [data, hora, escolhidos, selectedProfessional?.name, total]);

  useEffect(() => {
    fetch("/api/services").then((r) => r.json()).then(setCategorias);
  }, []);

  // profissionais que executam TODOS os serviços escolhidos
  useEffect(() => {
    if (!selecionados.length) return;
    fetch(`/api/professionals?serviceIds=${selecionados.join(",")}`)
      .then((r) => r.json())
      .then(setProfissionais);
    setSelectedProfessionalId("ANY");
    setData(null);
    setHora(null);
  }, [selecionados]);

  // horários reais calculados pelo servidor
  useEffect(() => {
    if (passo !== 2 || !data || !selecionados.length) return;
    const professionalParam = selectedProfessionalParam || "ANY";
    setCarregandoHorarios(true);
    setHora(null);
    fetch(
      `/api/availability?serviceIds=${encodeURIComponent(selecionados.join(","))}&professionalId=${encodeURIComponent(professionalParam)}&date=${encodeURIComponent(data)}`
    )
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error ?? "Não foi possível carregar os horários.");
        }
        return Array.isArray(body?.horarios) ? body.horarios : [];
      })
      .then((lista) => setHorarios(Array.isArray(lista) ? lista : []))
      .catch((error) => {
        setHorarios([]);
        setErro(error instanceof Error ? error.message : "Não foi possível carregar os horários.");
      })
      .finally(() => setCarregandoHorarios(false));
  }, [passo, data, selectedProfessionalParam, selecionados]);

  const alternar = (id: string) =>
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const podeAvancar =
    (passo === 0 && selecionados.length > 0) ||
    (passo === 1 && profissionais.length > 0) ||
    (passo === 2 && !!data && !!hora) ||
    passo === 3;

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    const profissionalParaEnviar = selectedProfessionalId && selectedProfessionalId !== "ANY" ? selectedProfessionalId : "ANY";
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceIds: selecionados, professionalId: profissionalParaEnviar, date: data, time: hora }),
    });
    setEnviando(false);
    if (res.ok) return setConcluido(true);
    if (res.status === 401) return (window.location.href = "/login?next=/agendar");
    const body = await res.json().catch(() => ({}));
    setErro(body.error ?? "Não foi possível agendar.");
    if (res.status === 409) setPasso(2); // horário foi ocupado: volta para escolher outro
  }

  if (concluido) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
        <h1 className="text-2xl font-semibold">Agendamento realizado!</h1>
        <p className="text-neutral-600">
          {data && dias.find((d) => d.iso === data)?.completo} às {hora}
        </p>
        {comprovanteLink ? (
          <a
            href={comprovanteLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-medium text-white shadow-sm transition hover:bg-emerald-500"
          >
            <span aria-hidden="true">💬</span>
            Enviar comprovante pelo WhatsApp
          </a>
        ) : null}
        <a href="/meus-agendamentos" className="mt-2 w-full rounded-xl bg-zinc-900 py-3 font-medium text-white shadow-sm transition hover:bg-zinc-800">
          Ver meus agendamentos
        </a>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-white">
      {/* Cabeçalho + progresso */}
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/90 px-4 pb-3 pt-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center gap-2">
          {passo > 0 && (
            <button onClick={() => setPasso(passo - 1)} aria-label="Voltar" className="-ml-2 p-2 text-xl text-zinc-700">
              ←
            </button>
          )}
          <h1 className="text-lg font-semibold text-zinc-900">{PASSOS[passo]}</h1>
          <span className="ml-auto text-sm text-zinc-500">
            {passo + 1}/{PASSOS.length}
          </span>
        </div>
        <div className="flex gap-1.5">
          {PASSOS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= passo ? "bg-zinc-900" : "bg-zinc-200"}`} />
          ))}
        </div>
      </header>

      {/* Conteúdo (padding inferior para não ficar atrás da barra fixa) */}
      <main className="flex-1 px-4 pb-40 pt-4">
        {/* 1. SERVIÇOS */}
        {passo === 0 && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
              {[
                "Todas",
                ...categorias.map((cat) => cat.name),
              ].map((categoria) => {
                const ativa = categoriaAtiva === categoria;
                return (
                  <button
                    key={categoria}
                    type="button"
                    onClick={() => setCategoriaAtiva(categoria)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
                      ativa
                        ? "border-rose-300 bg-rose-50/60 text-rose-950 shadow-sm"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
                    }`}
                    aria-label={`Filtrar por ${categoria}`}
                  >
                    {categoria}
                  </button>
                );
              })}
            </div>

            {categoriasExibidas.map((cat) => (
              <section key={cat.id} className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">{cat.name}</h2>
                <div className="grid gap-3">
                  {cat.services.map((s) => {
                    const ativo = selecionados.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => alternar(s.id)}
                        aria-pressed={ativo}
                        className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition-all duration-200 active:scale-[0.99] ${
                          ativo
                            ? "border-rose-300 bg-rose-50/60 shadow-md"
                            : "border-zinc-200/80 bg-white hover:border-zinc-300 hover:shadow-md"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                            ativo ? "border-rose-300 bg-rose-50 text-rose-950" : "border-zinc-300 bg-white text-transparent"
                          }`}
                        >
                          {ativo ? "✓" : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold text-zinc-900">{s.name}</span>
                          <span className="mt-1 block text-sm text-zinc-600">{s.description || "Atendimento personalizado."}</span>
                          <span className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-500">
                            <span>{duracao(s.durationMin)}</span>
                            <span className="h-1 w-1 rounded-full bg-zinc-300" />
                            <span>{brl(s.priceCents)}</span>
                          </span>
                        </span>
                        <span className={`text-sm font-semibold ${ativo ? "text-rose-950" : "text-zinc-700"}`}>
                          {brl(s.priceCents)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {servicosFiltrados.length === 0 && (
              <p className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
                Nenhum serviço disponível nesta categoria.
              </p>
            )}
          </div>
        )}

        {/* 2. PROFISSIONAL */}
        {passo === 1 && profissionais.length === 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Nenhum profissional realiza todos esses serviços juntos. Volte e escolha serviços de uma mesma área,
            ou faça agendamentos separados.
          </p>
        )}
        {passo === 1 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[{ id: "ANY", name: "Qualquer profissional" } as Profissional, ...profissionais].map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedProfessionalId(p.id)}
                  aria-pressed={selectedProfessionalId === p.id}
                  className={`flex h-full w-full flex-col items-center gap-2 rounded-xl border p-4 text-center transition ${
                    selectedProfessionalId === p.id ? "border-rose-300 bg-rose-50/60 ring-1 ring-rose-200" : "border-zinc-200 bg-white"
                  }`}
                >
                  <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-2xl">
                    {p.photoUrl ? <img src={p.photoUrl} alt="" className="h-full w-full object-cover" /> : p.id === "ANY" ? "✨" : p.name[0]}
                  </span>
                  <span className="text-sm font-medium leading-tight">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 3. DATA E HORA */}
        {passo === 2 && (
          <>
            <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2">
              {dias.map((d) => (
                <button
                  key={d.iso}
                  onClick={() => setData(d.iso)}
                  className={`flex w-16 shrink-0 snap-start flex-col items-center rounded-xl border py-2 ${
                    data === d.iso ? "border-rose-300 bg-rose-50/60 text-rose-950" : "border-zinc-200 bg-white text-zinc-700"
                  }`}
                >
                  <span className="text-[11px] uppercase tracking-wider text-zinc-500">{d.semana}</span>
                  <span className="text-xl font-semibold text-zinc-900">{d.dia}</span>
                  <span className="text-[11px] uppercase tracking-wider text-zinc-500">{d.mes}</span>
                </button>
              ))}
            </div>

            <div className="mt-5">
              {!data && <p className="text-neutral-500">Escolha um dia para ver os horários.</p>}
              {data && carregandoHorarios && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-live="polite" aria-busy="true">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-lg bg-neutral-200" />
                  ))}
                </div>
              )}
              {data && !carregandoHorarios && (horarios || []).length === 0 && (
                <p className="rounded-xl bg-neutral-50 p-4 text-neutral-600">
                  Nenhum horário disponível para esta data.
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(horarios || []).map((h) => (
                  <button
                    key={h}
                    onClick={() => setHora(h)}
                    aria-label={`Selecionar horário ${h}`}
                    className={`rounded-lg border py-3 font-medium ${
                      hora === h ? "border-rose-600 bg-rose-600 text-white" : "border-neutral-200 active:bg-neutral-50"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 4. RESUMO */}
        {passo === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <p className="text-sm text-neutral-500">Quando</p>
              <p className="font-medium capitalize">{data && dias.find((d) => d.iso === data)?.completo}</p>
              <p className="font-medium">às {hora}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-sm text-neutral-500">Profissional</p>
              <p className="font-medium">
               {!selectedProfessionalId || selectedProfessionalId === "ANY"
                 ? "Qualquer profissional disponível"
                 : selectedProfessional?.name ?? "Profissional selecionado"}
              </p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="mb-2 text-sm text-neutral-500">Serviços</p>
              <ul className="space-y-1">
                {escolhidos.map((s) => (
                  <li key={s.id} className="flex justify-between">
                    <span>{s.name}</span>
                    <span>{brl(s.priceCents)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t pt-3 font-semibold">
                <span>Total ({duracao(minutos)})</span>
                <span>{brl(total)}</span>
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              Cancelamentos devem ser feitos com antecedência mínima definida pelo salão.
            </p>
            {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
          </div>
        )}
        {passo !== 3 && erro && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      </main>

      {/* Barra fixa inferior (polegar-friendly) */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-100 bg-white/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-4">
          <div className="min-w-0 flex-1 text-sm">
            {selecionados.length > 0 ? (
              <>
                <p className="font-semibold">{brl(total)}</p>
                <p className="truncate text-neutral-500">
                  {selecionados.length} serviço{selecionados.length > 1 && "s"} · {duracao(minutos)}
                </p>
              </>
            ) : (
              <p className="text-neutral-500">Selecione ao menos um serviço</p>
            )}
          </div>
          <button
            disabled={!podeAvancar || enviando}
            onClick={() => (passo === 3 ? confirmar() : setPasso(passo + 1))}
            className="rounded-xl bg-zinc-900 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {passo === 3 ? (enviando ? "Agendando…" : "Confirmar") : "Continuar"}
          </button>
        </div>
      </footer>
    </div>
  );
}

