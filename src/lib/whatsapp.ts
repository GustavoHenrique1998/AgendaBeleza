export type WhatsAppMessageData = {
  clientName?: string | null;
  phone?: string | null;
  date?: string | null;
  time?: string | null;
  services?: string[] | null;
  professionalName?: string | null;
  totalCents?: number | null;
  notes?: string | null;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function normalizeWhatsappPhone(phone?: string | null, fallback?: string | null) {
  const digits = (phone ?? fallback ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function buildWhatsappText(data: WhatsAppMessageData) {
  const nome = data.clientName?.trim() || "Cliente";
  const servicos = (data.services ?? []).length ? data.services!.join(", ") : "Serviço agendado";
  const profissional = data.professionalName?.trim() || "Profissional";
  const dataFormatada = data.date ? new Date(`${data.date}T12:00:00`).toLocaleDateString("pt-BR") : "--";
  const valor = typeof data.totalCents === "number" ? moeda.format(data.totalCents / 100) : "--";

  const linhas = [
    "*Agendamento confirmado* ✅",
    "",
    `*Cliente:* ${nome}`,
    `*Data:* ${dataFormatada}`,
    `*Horário:* ${data.time ?? "--"}`,
    `*Serviços:* ${servicos}`,
    `*Profissional:* ${profissional}`,
    `*Valor total:* ${valor}`,
  ];

  if (data.notes?.trim()) linhas.push(`*Observações:* ${data.notes.trim()}`);

  linhas.push("", "Obrigado pela confiança! 💇‍♀️✨");
  return linhas.join("\n");
}

export function buildWhatsappLink(data: WhatsAppMessageData, fallbackPhone?: string | null) {
  const phone = normalizeWhatsappPhone(data.phone, fallbackPhone ?? process.env.NEXT_PUBLIC_SALAO_WHATSAPP ?? "5511999999999");
  if (!phone) return null;
  const text = buildWhatsappText(data);
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
