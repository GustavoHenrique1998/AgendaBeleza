// @ts-nocheck
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hojeNoFuso, limitesDoDia, somarDias, utcParaLocal } from "@/lib/datas";
import { authOptions, ErroNegocio, erroHttp } from "@/server/auth";
import { getServerSession } from "next-auth";
import { obterConfiguracoes } from "@/server/configuracoes";
import { criarAgendamento } from "@/server/agendamentos";
import { dataSchema, horaSchema, lerCorpo, lerQuery, statusSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: dataSchema.optional(),
  to: dataSchema.optional(),
  status: statusSchema.optional(),
  q: z.string().trim().optional(),
  professionalId: z.string().trim().optional(),
});

// Lista de agendamentos por período
export async function GET(req: Request) {
  try {
    const sessao = await getServerSession(authOptions);
    const usuario = sessao?.user as any;
    if (!usuario?.id) {
      return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
    }
    if (usuario.role !== "ADMIN" && usuario.role !== "PROFESSIONAL") {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }
    if (usuario.role === "PROFESSIONAL" && !usuario.professionalId) {
      return NextResponse.json({ error: "Perfil profissional sem vínculo ativo." }, { status: 403 });
    }

    const q = lerQuery(req.url, querySchema);
    if ("erro" in q) return q.erro;

    const config = await obterConfiguracoes();
    const hoje = hojeNoFuso(config.timezone);
    const from = q.dados.from ?? hoje;
    const to = q.dados.to ?? somarDias(from, 7);
    const { inicio } = limitesDoDia(from, config.timezone);
    const { fim } = limitesDoDia(to, config.timezone);

    const professionalFilter =
      usuario.role === "PROFESSIONAL"
        ? { professionalId: usuario.professionalId }
        : q.dados.professionalId
          ? { professionalId: q.dados.professionalId }
          : undefined;

    const lista = await prisma.appointment.findMany({
      where: {
        startsAt: { gte: inicio, lt: fim },
        ...(professionalFilter ? { professionalId: professionalFilter.professionalId } : {}),
        ...(q.dados.status ? { status: q.dados.status } : {}),
        ...(q.dados.q ? { client: { name: { contains: q.dados.q, mode: "insensitive" as const } } } : {}),
      },
      orderBy: { startsAt: "asc" },
      take: 500,
      include: {
        client: { select: { id: true, name: true, phone: true } },
        professional: { select: { name: true } },
        services: { orderBy: { position: "asc" } },
      },
    });

    return NextResponse.json(
      lista.map((x: any) => {
        const ini = utcParaLocal(x.startsAt, config.timezone);
        return {
          id: x.id,
          date: ini.date,
          time: ini.time,
          endTime: utcParaLocal(x.endsAt, config.timezone).time,
          status: x.status,
          source: x.source,
          clientName: x.client.name,
          clientPhone: x.client.phone,
          professionalName: x.professional.name,
          servicos: x.services.map((s: any) => s.name),
          totalCents: x.totalCents,
          notes: x.notes,
        };
      })
    );
  } catch (e) {
    return erroHttp(e);
  }
}

const criarSchema = z
  .object({
    clientId: z.string().optional(),
    novoCliente: z
      .object({ name: z.string().trim().min(2, "Informe o nome do cliente."), phone: z.string().trim().optional() })
      .optional(),
    serviceIds: z.array(z.string()).min(1, "Escolha ao menos um serviço."),
    professionalId: z.string().min(1),
    date: dataSchema,
    time: horaSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.clientId || d.novoCliente, { message: "Escolha ou cadastre o cliente." });

// Agendamento manual (cliente que ligou / mandou mensagem)
export async function POST(req: Request) {
  try {
    const a = await exigirSessao(true);
    if ("erro" in a) return a.erro;
    const c = await lerCorpo(req, criarSchema);
    if ("erro" in c) return c.erro;
    const d = c.dados;

    let clientId = d.clientId;
    if (clientId) {
      const existe = await prisma.user.findFirst({ where: { id: clientId, role: "CLIENT" } });
      if (!existe) throw new ErroNegocio("Cliente não encontrado.", 404);
    } else {
      const novo = await prisma.user.create({
        data: { name: d.novoCliente!.name, phone: d.novoCliente!.phone || null, role: "CLIENT" },
      });
      clientId = novo.id;
    }

    const ag = await criarAgendamento({
      clientId,
      serviceIds: d.serviceIds,
      professionalId: String(d.professionalId ?? "ANY"),
      date: d.date,
      time: d.time,
      source: "ADMIN",
      notes: d.notes,
    });
    return NextResponse.json({ id: ag.id }, { status: 201 });
  } catch (e) {
    return erroHttp(e);
  }
}
