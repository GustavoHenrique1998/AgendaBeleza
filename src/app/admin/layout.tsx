"use client";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const LINKS = [
  { href: "/admin", rotulo: "Resumo" },
  { href: "/admin/agenda", rotulo: "Agenda" },
  { href: "/admin/agendamentos", rotulo: "Agendamentos" },
  { href: "/admin/horarios", rotulo: "Horários de Atendimento" },
  { href: "/admin/bloqueios", rotulo: "Bloqueios" },
  { href: "/admin/servicos", rotulo: "Serviços" },
  { href: "/admin/profissionais", rotulo: "Profissionais" },
  { href: "/admin/clientes", rotulo: "Clientes" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-zinc-200/60 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-6">
          <span className="shrink-0 font-semibold text-zinc-900">Painel</span>
          <nav className="flex flex-1 gap-2 overflow-x-auto whitespace-nowrap py-2 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {LINKS.map((l) => {
              const ativo = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
              return (
                <a
                  key={l.href}
                  href={l.href}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    ativo ? "bg-rose-50/60 text-rose-950 ring-1 ring-rose-200/70" : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {l.rotulo}
                </a>
              );
            })}
          </nav>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="whitespace-nowrap text-sm text-zinc-600">
            Sair
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
