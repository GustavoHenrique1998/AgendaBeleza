import { NextResponse } from "next/server";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email e senha",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          professionalId: user.professionalId,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const dados = user as any;
        token.id = dados.id ?? token.sub;
        token.role = dados.role ?? token.role;
        token.professionalId = dados.professionalId ?? token.professionalId ?? null;
      }

      if (!token.id && token.sub) {
        token.id = token.sub;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const user = session.user as any;
        user.id = typeof token.id === "string" ? token.id : typeof token.sub === "string" ? token.sub : user.id;
        user.role = (token.role as "CLIENT" | "ADMIN" | "PROFESSIONAL") ?? "CLIENT";
        user.professionalId = typeof token.professionalId === "string" ? token.professionalId : null;
      }
      return session;
    },
  },
};

export type UsuarioSessao = { id: string; name: string; role: "CLIENT" | "ADMIN" | "PROFESSIONAL"; professionalId?: string | null };

/**
 * Uso nas rotas:
 *   const a = await exigirSessao(true);   // true = só ADMIN
 *   if ("erro" in a) return a.erro;
 *   a.usuario.id ...
 */
export async function exigirSessao(somenteAdmin = false) {
  const sessao = await getServerSession(authOptions);
  const u = sessao?.user as any;
  if (!u?.id) {
    return { erro: NextResponse.json({ error: "Faça login para continuar." }, { status: 401 }) };
  }
  if (somenteAdmin && u.role !== "ADMIN") {
    return { erro: NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) };
  }
  return {
    usuario: {
      id: u.id,
      name: u.name ?? "",
      role: u.role,
      professionalId: u.professionalId ?? null,
    } as UsuarioSessao,
  };
}

/** Para as rotas: converte exceções comuns em respostas HTTP. */
export function erroHttp(e: unknown) {
  if (e instanceof Error && "status" in e && typeof (e as any).status === "number") {
    return NextResponse.json({ error: e.message }, { status: (e as any).status });
  }
  console.error(e);
  return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
}

export class ErroNegocio extends Error {
  status: number;
  constructor(mensagem: string, status = 400) {
    super(mensagem);
    this.status = status;
  }
}
