// @ts-nocheck
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { diaDaSemana, limitesDoDia } from "@/lib/datas";
import { erroHttp, exigirSessao } from "@/server/auth";
import { obterConfiguracoes } from "@/server/configuracoes";
import { dataSchema, lerQuery } from "@/server/validators";

export const dynamic = "force-dynamic";

type Bloqueio = { id: string; startMin: number; endMin: number; reason?: string };

// Agenda do dia: uma coluna por profissional + resumo (dashboard)
export async function GET(req: Request) {
  try {
    const a = await exigirSessao(true);
    if ("erro" in a) return a.erro;
    const q = lerQuery(req.url, z.object({ date: dataSchema }));
    if ("erro" in q) return q.erro;
    const { date } = q.dados;

    const config = await obterConfiguracoes();
    const { inicio, fim } = limitesDoDia(date, config.timezone);
    const weekday = diaDaSemana(date);
    const paraMin = (d: Date) => Math.round((d.getTime() - inicio.getTime()) / 60000);
    const clamp = (m: number) => Math.min(1440, Math.max(0, m));

    const [profs, escalas, ags, bloqueiosDb] = await Promise.all([
      prisma.professional.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.workSchedule.findMany({ where: { weekday } }),
      prisma.appointment.findMany({
        where: { startsAt: { lt: fim }, endsAt: { gt: inicio } },
        orderBy: { startsAt: "asc" },
        include: {
          client: { select: { id: true, name: true, phone: true } },
          professional: { select: { name: true } },
          services: { orderBy: { position: "asc" } },
        },
      }),
      prisma.timeBlock.findMany({ where: { startsAt: { lt: fim }, endsAt: { gt: inicio } } }),
    ]);

    const salao = escalas.find((e: any) => e.professionalId === null);

    // Quem aparece: trabalha neste dia OU tem agendamento neste dia
    const infos = profs
      .map((p: any) => {
        const esc = escalas.find((e: any) => e.professionalId === p.id);
        const trabalha = !!(salao?.isOpen && esc?.isOpen);
        const exp = trabalha
          ? { start: Math.max(salao!.startMin, esc!.startMin), end: Math.min(salao!.endMin, esc!.endMin) }
          : null;
        const temAg = ags.some((x: any) => x.professionalId === p.id);
        return { p, esc, trabalha: trabalha && !!exp && exp.start < exp.end, exp, temAg };
      })
      .filter((i: any) => i.trabalha || i.temAg);

    // Faixa visível: do expediente mais cedo ao mais tarde, cobrindo os agendamentos
    const inicios: number[] = [];
    const fins: number[] = [];
    for (const i of infos) {
      if (i.trabalha && i.exp) {
        inicios.push(i.exp.start);
        fins.push(i.exp.end);
      }
    }
    for (const x of ags) {
      inicios.push(clamp(paraMin(x.startsAt)));
      fins.push(clamp(paraMin(x.endsAt)));
    }
    let inicioMin = inicios.length ? Math.floor(Math.min(...inicios) / 60) * 60 : 540;
    let fimMin = fins.length ? Math.ceil(Math.max(...fins) / 60) * 60 : 1080;
    if (fimMin - inicioMin < 60) fimMin = inicioMin + 60;

    const profissionais = infos.map(({ p, esc, trabalha, exp }: any) => {
      const bloqueios: Bloqueio[] = [];
      if (!trabalha || !exp) {
        bloqueios.push({ id: `${p.id}-folga`, startMin: inicioMin, endMin: fimMin, reason: "Não trabalha neste dia" });
      } else {
        if (exp.start > inicioMin) bloqueios.push({ id: `${p.id}-pre`, startMin: inicioMin, endMin: exp.start, reason: "Fora do expediente" });
        if (exp.end < fimMin) bloqueios.push({ id: `${p.id}-pos`, startMin: exp.end, endMin: fimMin, reason: "Fora do expediente" });
        const vistos = new Set<string>();
        for (const h of [salao, esc]) {
          if (h?.breakStartMin != null && h.breakEndMin != null) {
            const chave = `${h.breakStartMin}-${h.breakEndMin}`;
            if (vistos.has(chave)) continue;
            vistos.add(chave);
            bloqueios.push({ id: `${p.id}-pausa-${chave}`, startMin: h.breakStartMin, endMin: h.breakEndMin, reason: "Almoço / pausa" });
          }
        }
      }
      for (const b of bloqueiosDb) {
        if (b.professionalId !== null && b.professionalId !== p.id) continue;
        bloqueios.push({ id: b.id, startMin: clamp(paraMin(b.startsAt)), endMin: clamp(paraMin(b.endsAt)), reason: b.reason ?? "Bloqueado" });
      }

      return {
        id: p.id,
        name: p.name,
        bloqueios,
        agendamentos: ags
          .filter((x: any) => x.professionalId === p.id)
          .map((x: any) => ({
            id: x.id,
            startMin: clamp(paraMin(x.startsAt)),
            endMin: clamp(paraMin(x.endsAt)),
            status: x.status,
            clientName: x.client.name,
            clientPhone: x.client.phone ?? null,
            servicos: x.services.map((s: any) => s.name),
            totalCents: x.totalCents,
          })),
      };
    });

    const vivos = ags.filter((x: any) => x.status !== "CANCELLED");
    const contam = ags.filter((x: any) => ["PENDING", "CONFIRMED", "COMPLETED"].includes(x.status));
    const resumo = {
      total: vivos.length,
      faturamentoEstimadoCents: contam.reduce((s: number, x: any) => s + x.totalCents, 0),
      concluidos: ags.filter((x: any) => x.status === "COMPLETED").length,
      clientes: new Set(contam.map((x: any) => x.clientId)).size,
    };

    // Lista plana (usada no dashboard)
    const lista = vivos.map((x: any) => ({
      id: x.id,
      startMin: clamp(paraMin(x.startsAt)),
      endMin: clamp(paraMin(x.endsAt)),
      status: x.status,
      clientName: x.client.name,
      clientPhone: x.client.phone ?? null,
      professionalName: x.professional.name,
      servicos: x.services.map((s: any) => s.name),
      totalCents: x.totalCents,
    }));

    return NextResponse.json({ date, inicioMin, fimMin, resumo, profissionais, lista });
  } catch (e) {
    return erroHttp(e);
  }
}
