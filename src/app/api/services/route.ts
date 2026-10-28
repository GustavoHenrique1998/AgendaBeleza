// @ts-nocheck
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { erroHttp } from "@/server/auth";

export const dynamic = "force-dynamic";

// Catálogo público: categorias com seus serviços ativos
export async function GET() {
  try {
    const categorias = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        services: {
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, description: true, priceCents: true, durationMin: true },
        },
      },
    });
    return NextResponse.json(categorias.filter((c: any) => c.services.length > 0));
  } catch (e) {
    return erroHttp(e);
  }
  
}
