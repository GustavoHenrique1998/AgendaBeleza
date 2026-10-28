// @ts-nocheck
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ErroNegocio, erroHttp, exigirSessao } from "@/server/auth";
import { lerCorpo } from "@/server/validators";

export const dynamic = "force-dynamic";

type Dia = {
  weekday: number;
  isOpen: boolean;
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
};

function semanaPadrao(): Dia[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isOpen: weekday >= 1 && weekday <= 6,
    startMin: 8 * 60,
    endMin: 18 * 60,
    breakStartMin: weekday >= 1 && weekday <= 6 ? 12 * 60 : null,
    breakEndMin: weekday >= 1 && weekday <= 6 ? 13 * 60 : null,
  }));
}

// Sempre devolve 7 dias (0=domingo..6=sábado); dia sem linha = fechado
function completarSemana(linhas: Dia[]): Dia[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const l = linhas.find((x: any) => x.weekday === weekday);
    return l
      ? { weekday, isOpen: l.isOpen, startMin: l.startMin, endMin: l.endMin, breakStartMin: l.breakStartMin, breakEndMin: l.breakEndMin }
      : { weekday, isOpen: false, startMin: 540, endMin: 1080, breakStartMin: null, breakEndMin: null };
  });
}

export async function GET() {
  try {
    const a = await exigirSessao(true);
    if ("erro" in a) return a.erro;
    const [linhas, profs] = await Promise.all([
      prisma.workSchedule.findMany(),
      prisma.professional.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    ]);

    const salaoLinhas = linhas.filter((l: any) => l.professionalId === null);
    const salaoPadrao = salaoLinhas.length > 0 ? completarSemana(salaoLinhas) : semanaPadrao();

    return NextResponse.json({
      salao: salaoPadrao,
      profissionais: profs.map((p: any) => {
        const diasProf = linhas.filter((l: any) => l.professionalId === p.id);
        return {
          id: p.id,
          name: p.name,
          dias: diasProf.length > 0 ? completarSemana(diasProf) : semanaPadrao(),
        };
      }),
    });
  } catch (e) {
    return erroHttp(e);
  }
}

const min = z.number().int().min(0).max(1440);
const diaSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  isOpen: z.boolean(),
  startMin: min,
  endMin: min,
  breakStartMin: min.nullable().optional(),
  breakEndMin: min.nullable().optional(),
});
const schema = z.object({
  professionalId: z.string().nullable(), // null = expediente geral do salão
  dias: z.array(diaSchema).max(7),
});

// Substitui a semana inteira do salão (professionalId null) ou de um profissional
export async function PUT(req: Request) {
  try {
    const a = await exigirSessao(true);
    if ("erro" in a) return a.erro;
    const c = await lerCorpo(req, schema);
    if ("erro" in c) return c.erro;
    const { professionalId, dias } = c.dados;

    const semana = new Set<number>();
    for (const d of dias) {
      if (semana.has(d.weekday)) throw new ErroNegocio("Dia da semana repetido.");
      semana.add(d.weekday);
      if (!d.isOpen) continue;
      if (d.startMin >= d.endMin) throw new ErroNegocio("O horário de saída deve ser depois da entrada.");
      const bi = d.breakStartMin ?? null;
      const bf = d.breakEndMin ?? null;
      if ((bi === null) !== (bf === null)) throw new ErroNegocio("Informe o início e o fim do almoço.");
      if (bi !== null && bf !== null && (bi >= bf || bi < d.startMin || bf > d.endMin)) {
        throw new ErroNegocio("O almoço deve estar dentro do expediente.");
      }
    }

    if (professionalId) {
      const p = await prisma.professional.findUnique({ where: { id: professionalId } });
      if (!p) throw new ErroNegocio("Profissional não encontrado.", 404);
    }

    await prisma.$transaction([
      prisma.workSchedule.deleteMany({ where: { professionalId } }),
      prisma.workSchedule.createMany({
        data: dias
          .filter((d) => d.isOpen)
          .map((d) => ({
            professionalId,
            weekday: d.weekday,
            isOpen: true,
            startMin: d.startMin,
            endMin: d.endMin,
            breakStartMin: d.breakStartMin ?? null,
            breakEndMin: d.breakEndMin ?? null,
          })),
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroHttp(e);
  }
}
