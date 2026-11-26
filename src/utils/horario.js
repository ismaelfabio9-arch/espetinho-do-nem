// Cardápio automático: cada categoria pode ter um horário (Almoço das 10:00 às 16:00, Pizzas das 16:00
// até fechar) e cada produto pode ter os dias da semana em que entra. Fora do horário o produto some do
// garçom e do cliente; a categoria que está no horário vem primeiro. A dona ainda liga ou desliga na mão
// em Cardápio de hoje (vale só para hoje).
//
// categorias/<id>.horario = { de: "10:00", ate: "16:00", dias?: [0..6] }  (ate vazio = até fechar)
// produtos/<id>.dias = [0..6] (vazio = todos os dias)
// produtos/<id>.ligadoHoje = { dia: "AAAA-MM-DD", ligado: true | false } (mudança na mão, só hoje)
// produtos/<id>.feriado = true: também entra no feriado ("Hoje é feriado" em Cardápio de hoje liga só hoje)
// produtos/<id>.soNaMao = true: prato de dias variados, só aparece no dia em que a dona liga
import { useEffect, useState } from "react";

export const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const minutos = (t) => {
  const m = /^(\d{1,2}):?(\d{2})?$/.exec(String(t || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null;
};

/** O horário vale agora? null = sem horário (sempre). */
export function noHorario(h, agora = new Date()) {
  if (!h) return null;
  const de = minutos(h.de);
  const ate = minutos(h.ate);
  const dias = Array.isArray(h.dias) && h.dias.length ? h.dias : null;
  if (de === null && ate === null && !dias) return null;
  if (dias && !dias.includes(agora.getDay())) return false;
  const m = agora.getHours() * 60 + agora.getMinutes();
  const inicio = de ?? 0;
  const fim = ate ?? 24 * 60;
  return inicio <= fim ? m >= inicio && m < fim : m >= inicio || m < fim; // passa da meia-noite
}

const categoriaDe = (p, categoriasDocs) => (categoriasDocs || []).find((c) => c.nome === p.categoria) || null;

/** Tem regra automática (horário da categoria ou dias do produto)? */
export function temHorario(p, categoriasDocs) {
  return p.soNaMao === true || noHorario(categoriaDe(p, categoriasDocs)?.horario) !== null || (Array.isArray(p.dias) && p.dias.length > 0);
}

/** O produto pelo horário e pelos dias (sem contar a mudança na mão). */
export function pelaRegra(p, categoriasDocs, agora = new Date()) {
  if (p.soNaMao === true) return false;
  if (Array.isArray(p.dias) && p.dias.length && !p.dias.includes(agora.getDay())) return false;
  return noHorario(categoriaDe(p, categoriasDocs)?.horario, agora) !== false;
}

/** Aparece agora para o garçom e o cliente? */
export function disponivelAgora(p, categoriasDocs, agora = new Date()) {
  if (p.ativo === false) return false;
  if (p.foraHoje === true) return false; // acabou ou desligado em Cardápio de hoje
  if (p.ligadoHoje && p.ligadoHoje.dia === dia(agora)) return !!p.ligadoHoje.ligado;
  return pelaRegra(p, categoriasDocs, agora);
}

/** A categoria está no horário dela agora? (vem primeiro no cardápio) */
export function categoriaNoHorario(catDoc, agora = new Date()) {
  return noHorario(catDoc?.horario, agora) === true;
}

/** "Sáb, Dom e feriado", "só quando ligar" (para mostrar ao lado do produto). */
export function textoDias(p) {
  if (p.soNaMao === true) return "só quando ligar";
  const dias = Array.isArray(p.dias) && p.dias.length > 0 && p.dias.length < 7 ? p.dias.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DIAS[d]) : [];
  if (p.feriado === true) return dias.length ? `${dias.join(", ")} e feriado` : "";
  return dias.join(", ");
}

/** "10:00 às 16:00", "a partir das 16:00", "Seg, Qua" */
export function textoHorario(h) {
  if (!h) return "";
  const dias = Array.isArray(h.dias) && h.dias.length && h.dias.length < 7 ? h.dias.slice().sort().map((d) => DIAS[d]).join(", ") : "";
  const hora = h.de && h.ate ? `${h.de} às ${h.ate}` : h.de ? `a partir das ${h.de}` : h.ate ? `até ${h.ate}` : "";
  return [hora, dias].filter(Boolean).join(" · ");
}

export const hojeISO = () => dia(new Date());

/** Muda a cada minuto (para o cardápio trocar sozinho na hora certa). */
export function useMinuto() {
  const [m, setM] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const t = setInterval(() => setM(Math.floor(Date.now() / 60000)), 20000);
    return () => clearInterval(t);
  }, []);
  return m;
}
