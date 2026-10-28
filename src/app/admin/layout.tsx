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
      <header className="sticky top-0 z-30 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-6">
          <span className="font-semibold text-rose-600">Painel</span>
          <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1">
            {LINKS.map((l) => {
              const ativo = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
              return (
                <a
                  key={l.href}
                  href={l.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                    ativo ? "bg-rose-50 text-rose-700" : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {l.rotulo}
                </a>
              );
            })}
          </nav>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="whitespace-nowrap text-sm text-neutral-500">
            Sair
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
