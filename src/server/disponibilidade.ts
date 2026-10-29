// @ts-nocheck
// Disponibilidade de horários (parte com banco de dados).
// A matemática de intervalos está em ./intervalos.ts (pura e testada).

import { prisma } from "@/lib/prisma";
import { diaDaSemana, hojeNoFuso, limitesDoDia, minutosParaHHMM, somarDias } from "@/lib/datas";
import { obterConfiguracoes } from "./configuracoes";
import { ErroNegocio } from "./auth";
import { gerarHorarios, janelasLivres, type Intervalo } from "./intervalos";

/** Status que ocupam a agenda. Apenas o cancelamento libera o horário. */
export const STATUS_QUE_OCUPAM = ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] as const;

export interface OpcoesDisponibilidade {
  /** Admin lançando manualmente: ignora antecedência mínima e limite de dias à frente. */
  ignorarAntecedencia?: boolean;
}

/** Valida os serviços e devolve a duração total (duração + intervalo de cada um). */
export async function resolverServicos(serviceIds: string[]) {
  const ids = [...new Set(serviceIds)];
  if (ids.length === 0) throw new ErroNegocio("Escolha ao menos um serviço.");
  const servicos = await prisma.service.findMany({ where: { id: { in: ids }, active: true } });
  if (servicos.length !== ids.length) throw new ErroNegocio("Serviço inválido ou indisponível.");
  const duracaoTotalMin = servicos.reduce((s, x) => s + x.durationMin + x.bufferMin, 0);
  const totalCents = servicos.reduce((s, x) => s + x.priceCents, 0);
  return { ids, servicos, duracaoTotalMin, totalCents };
}

/** Profissionais ativos que executam TODOS os serviços escolhidos. */
export async function profissionaisParaServicos(serviceIds: string[]) {
  const ids = [...new Set(serviceIds)];
  return prisma.professional.findMany({
    where: {
      active: true,
      AND: ids.map((id) => ({ services: { some: { serviceId: id } } })),
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Horários de INÍCIO ("HH:mm") possíveis para um profissional num dia.
 *
 *  1. Expediente = interseção(profissional, salão); tira almoço/pausas.
 *  2. Tira agendamentos ativos e bloqueios (do profissional e os gerais do salão).
 *  3. Um horário só é válido se o serviço INTEIRO cabe numa janela livre.
 */
export async function horariosDisponiveis(params: {
  professionalId: string;
  date: string; // YYYY-MM-DD no fuso do salão
  duracaoTotalMin: number;
  opcoes?: OpcoesDisponibilidade;
}): Promise<string[]> {
  const { professionalId, date, duracaoTotalMin } = params;
  const ignorar = params.opcoes?.ignorarAntecedencia ?? false;

  const config = await obterConfiguracoes();
  const tz = config.timezone;
  const agora = new Date();

  const hoje = hojeNoFuso(tz, agora);
  if (date < hoje) return [];
  if (!ignorar && date > somarDias(hoje, config.maxAdvanceDays)) return [];

  const { inicio, fim } = limitesDoDia(date, tz);
  const weekday = diaDaSemana(date);

  const [escalas, agendamentos, bloqueios] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { weekday, OR: [{ professionalId: null }, { professionalId }] },
    }),
    prisma.appointment.findMany({
      where: {
        professionalId,
        status: { not: "CANCELLED" },
        startsAt: { lt: fim },
        endsAt: { gt: inicio },
      },
      select: { startsAt: true, endsAt: true, status: true },
    }),
    prisma.timeBlock.findMany({
      where: {
        OR: [{ professionalId }, { professionalId: null }],
        startsAt: { lt: fim },
        endsAt: { gt: inicio },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const salao = escalas.find((e) => e.professionalId === null);
  const profissional = escalas.find((e) => e.professionalId === professionalId);

  const paraMin = (d: Date) => Math.round((d.getTime() - inicio.getTime()) / 60000);
  const ocupados: Intervalo[] = [...agendamentos, ...bloqueios].map((x) => ({
    start: Math.max(0, paraMin(x.startsAt)),
    end: Math.min(24 * 60, paraMin(x.endsAt)),
  }));

  const livres = janelasLivres(salao, profissional, ocupados);
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  const limiteHoje = date === hoje ? agoraMin + (ignorar ? 0 : config.minAdvanceMin) : 0;
  const minimoMin = Math.max(limiteHoje, 0);

  return gerarHorarios(livres, duracaoTotalMin, config.slotStepMin, minimoMin).map(minutosParaHHMM);
}

/**
 * "Qualquer profissional": junta os horários de todos que executam TODOS os
 * serviços. Retorna { "14:00": ["idA","idB"], ... } ordenado por horário.
 */
export async function horariosQualquerProfissional(
  serviceIds: string[],
  date: string,
  opcoes?: OpcoesDisponibilidade
): Promise<{ duracaoTotalMin: number; horarios: Record<string, string[]> }> {
  const { duracaoTotalMin } = await resolverServicos(serviceIds);
  const profissionais = await profissionaisParaServicos(serviceIds);

  const mapa: Record<string, string[]> = {};
  await Promise.all(
    profissionais.map(async (p) => {
      const hs = await horariosDisponiveis({ professionalId: p.id, date, duracaoTotalMin, opcoes });
      for (const h of hs) (mapa[h] ??= []).push(p.id);
    })
  );
  const ordenado = Object.fromEntries(Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b)));
  return { duracaoTotalMin, horarios: ordenado };
}

/** Garante que o profissional existe, está ativo e executa todos os serviços. */
export async function validarProfissional(professionalId: string, serviceIds: string[]) {
  const aptos = await profissionaisParaServicos(serviceIds);
  if (!aptos.some((p) => p.id === professionalId)) {
    throw new ErroNegocio("Este profissional não realiza todos os serviços escolhidos.");
  }
}
