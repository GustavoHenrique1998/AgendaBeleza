"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { brl, dataBR, duracao } from "@/lib/formatar";
import {
  Alerta,
  btnGhost,
  btnPrimary,
  Campo,
  inputCls,
  Modal,
  STATUS_INFO,
  StatusBadge,
  type Status,
} from "@/components/ui";
import { buildWhatsappLink } from "@/lib/whatsapp";

type Linha = {
  id: string;
  date: string;
  time: string;
  endTime: string;
  status: Status;
  source: "ONLINE" | "ADMIN";
  clientName: string;
  clientPhone: string | null;
  professionalName: string;
  servicos: string[];
  totalCents: number;
  notes: string | null;
};
type Categoria = { id: string; name: string; services: { id: string; name: string; priceCents: number; durationMin: number }[] };
type Cliente = { id: string; name: string; phone: string | null };
type Prof = { id: string; name: string };

const hojeLocal = (somar = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + somar);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function AgendamentosPage() {
  const [from, setFrom] = useState(hojeLocal());
  const [to, setTo] = useState(hojeLocal(7));
  const [status, setStatus] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("novo") === "1") setNovo(true);
  }, []);

  const carregar = useCallback(() => {
    const qs = new URLSearchParams({ from, to });
    if (status) qs.set("status", status);
    if (busca.trim()) qs.set("q", busca.trim());
    api<Linha[]>(`/api/admin/appointments?${qs}`)
      .then((l) => {
        setLista(l);
        setErro(null);
      })
      .catch((e) => setErro(e.message));
  }, [from, to, status, busca]);
  useEffect(carregar, [carregar]);

  async function mudarStatus(id: string, novoStatus: Status) {
    try {
      await api(`/api/admin/appointments/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: novoStatus }) });
      carregar();
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-3 pb-36 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Agendamentos</h1>
        <button onClick={() => setNovo(true)} className={btnPrimary}>+ Novo agendamento</button>
      </div>

      <div className="mb-4 grid w-full grid-cols-2 gap-3">
        <div className="w-full">
          <label className="mb-1 block text-sm font-medium text-zinc-700">De</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div className="w-full">
          <label className="mb-1 block text-sm font-medium text-zinc-700">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <div className="col-span-2 w-full sm:col-span-1">
          <Campo rotulo="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {(Object.keys(STATUS_INFO) as Status[]).map((s) => (
                <option key={s} value={s}>{STATUS_INFO[s].label}</option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="col-span-2 w-full sm:col-span-1">
          <Campo rotulo="Cliente">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome" className={inputCls} />
          </Campo>
        </div>
      </div>

      {erro && <Alerta>{erro}</Alerta>}
      {!lista && !erro && <p className="text-neutral-500">Carregando…</p>}
      {lista && lista.length === 0 && (
        <p className="rounded-xl bg-white p-6 text-center text-neutral-500">Nenhum agendamento neste período.</p>
      )}

      <ul className="space-y-2 pb-36">
        {lista?.map((a) => (
          <li key={a.id} className="rounded-xl border bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {dataBR(a.date)} · {a.time}–{a.endTime}
                </p>
                <p className="font-medium">{a.clientName}{a.clientPhone && <span className="font-normal text-neutral-500"> · {a.clientPhone}</span>}</p>
                <p className="text-sm text-neutral-500">
                  {a.servicos.join(", ")} · {a.professionalName} · {brl(a.totalCents)}
                  {a.source === "ADMIN" && " · lançado pelo salão"}
                </p>
                {a.notes && <p className="mt-1 text-sm italic text-neutral-500">“{a.notes}”</p>}
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const wa = buildWhatsappLink({
                    clientName: a.clientName,
                    phone: a.clientPhone,
                    date: a.date,
                    time: a.time,
                    services: a.servicos,
                    professionalName: a.professionalName,
                    totalCents: a.totalCents,
                  });
                  return wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                      aria-label={`Abrir WhatsApp de ${a.clientName}`}
                    >
                      WhatsApp
                    </a>
                  ) : null;
                })()}
                <StatusBadge status={a.status} />
                <select
                  aria-label="Alterar status"
                  value={a.status}
                  onChange={(e) => mudarStatus(a.id, e.target.value as Status)}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm"
                >
                  {(Object.keys(STATUS_INFO) as Status[]).map((s) => (
                    <option key={s} value={s}>{STATUS_INFO[s].label}</option>
                  ))}
                </select>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {novo && (
        <NovoAgendamento
          onClose={() => setNovo(false)}
          onCriado={() => {
            setNovo(false);
            carregar();
          }}
        />
      )}
    </main>
  );
}

function NovoAgendamento({ onClose, onCriado }: { onClose: () => void; onCriado: () => void }) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profs, setProfs] = useState<Prof[]>([]);

  const [modoCliente, setModoCliente] = useState<"existente" | "novo">("novo");
  const [clientId, setClientId] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [professionalId, setProfessionalId] = useState("ANY");
  const [date, setDate] = useState(hojeLocal());
  const [time, setTime] = useState("");
  const [horarios, setHorarios] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api<Categoria[]>("/api/services").then(setCategorias).catch(() => {});
    api<Cliente[]>("/api/admin/clients").then(setClientes).catch(() => {});
  }, []);

  const todos = useMemo(() => categorias.flatMap((c) => c.services), [categorias]);
  const escolhidos = todos.filter((s) => serviceIds.includes(s.id));
  const minutos = escolhidos.reduce((s, x) => s + x.durationMin, 0);
  const total = escolhidos.reduce((s, x) => s + x.priceCents, 0);
  const chave = serviceIds.join(",");

  useEffect(() => {
    if (!serviceIds.length) {
      setProfs([]);
      return;
    }
    api<Prof[]>(`/api/professionals?serviceIds=${chave}`).then(setProfs).catch(() => setProfs([]));
    setProfessionalId("ANY");
  }, [chave, serviceIds.length]);

  useEffect(() => {
    setTime("");
    if (!serviceIds.length || !date) {
      setHorarios([]);
      return;
    }
    api<{ horarios: string[] }>(`/api/availability?serviceIds=${chave}&professionalId=${professionalId}&date=${date}&admin=1`)
      .then((r) => setHorarios(r.horarios))
      .catch(() => setHorarios([]));
  }, [chave, professionalId, date, serviceIds.length]);

  const clientesFiltrados = clientes.filter((c) => c.name.toLowerCase().includes(buscaCliente.toLowerCase())).slice(0, 50);
  const alternar = (id: string) => setServiceIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api("/api/admin/appointments", {
        method: "POST",
        body: JSON.stringify({
          ...(modoCliente === "existente" ? { clientId } : { novoCliente: { name: nome, phone: telefone || undefined } }),
          serviceIds,
          professionalId,
          date,
          time,
          notes: notes || undefined,
        }),
      });
      onCriado();
    } catch (e: any) {
      setErro(e.message);
      setEnviando(false);
    }
  }

  const pronto = serviceIds.length > 0 && !!time && (modoCliente === "novo" ? nome.trim().length >= 2 : !!clientId);

  return (
    <Modal titulo="Novo agendamento" onClose={onClose}>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={modoCliente === "novo" ? btnPrimary : btnGhost} onClick={() => setModoCliente("novo")}>Cliente novo</button>
          <button type="button" className={modoCliente === "existente" ? btnPrimary : btnGhost} onClick={() => setModoCliente("existente")}>Já cadastrado</button>
        </div>

        {modoCliente === "novo" ? (
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} /></Campo>
            <Campo rotulo="Telefone"><input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputCls} /></Campo>
          </div>
        ) : (
          <div className="space-y-2">
            <input placeholder="Buscar cliente…" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} className={inputCls} />
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls} size={4}>
              {clientesFiltrados.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
              ))}
            </select>
          </div>
        )}

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-neutral-700">Serviços</legend>
          <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border p-2">
            {categorias.map((c) => (
              <div key={c.id}>
                <p className="text-xs font-semibold uppercase text-neutral-500">{c.name}</p>
                {c.services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                    <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => alternar(s.id)} />
                    <span className="flex-1">{s.name}</span>
                    <span className="text-neutral-500">{duracao(s.durationMin)} · {brl(s.priceCents)}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          {serviceIds.length > 0 && <p className="mt-1 text-sm text-neutral-600">Total: {brl(total)} · {duracao(minutos)}</p>}
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Profissional">
            <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className={inputCls}>
              <option value="ANY">Qualquer disponível</option>
              {profs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Data"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Campo>
        </div>

        <Campo rotulo="Horário">
          <select value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} disabled={!horarios.length}>
            <option value="">{serviceIds.length ? (horarios.length ? "Escolha…" : "Sem horários livres neste dia") : "Escolha os serviços primeiro"}</option>
            {horarios.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Campo>

        <Campo rotulo="Observações (opcional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} /></Campo>

        {erro && <Alerta>{erro}</Alerta>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>Cancelar</button>
          <button type="submit" disabled={!pronto || enviando} className={btnPrimary}>{enviando ? "Salvando…" : "Agendar"}</button>
        </div>
      </form>
    </Modal>
  );
}
