// Recursos por loja (Central da Loja no Admin da IFTech). Todas as lojas rodam o mesmo sistema;
// o que muda de uma loja para outra fica em mesasLojas/<id>/configuracoes/recursos:
//   { plano: "basico" | "completo" | "premium", recursos: { "qr-pedido": false, "beta": true, ... } }
// - "plano" vem do plano contratado no site (o servidor da IFTech grava): o plano menor desliga
//   algumas funções. Sem "plano" (lojas antigas, loja única): tudo como antes.
// - "recursos" é o que a IFTech ligou ou desligou à mão só nesta loja e vale mais que o plano.
// - Funções que já existem começam LIGADAS (padrao: true): a IFTech desliga só na loja que pediu.
// - Funções novas pedidas por um cliente começam DESLIGADAS (padrao: false): liga só para quem pediu.
// O cliente da mesa também lê esse documento (sem dados pessoais). Uso numa tela:
//   const viagem = useRecurso("viagem");
// Loja única (instalação própria, sem REACT_APP_MULTI): tudo no padrão.
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { MULTI, getLoja } from "./loja";
import { getTenant, subscribeTenant } from "./tenant";

/** Mesma lista do Admin (iftech: src/data/loja-recursos.ts). */
export const RECURSOS = {
  "qr-pedido": true,
  "chamar-garcom": true,
  "pedir-conta": true,
  "montar-prato": true,
  estoque: true,
  viagem: true,
  "imprimir-cozinha": true,
  relatorios: true,
  // Cardápio online (pedido de casa): função nova, só o plano Premium liga.
  "pedido-online": false,
  // Finanças (despesas, custo e lucro por categoria): função nova, os planos Completo e Premium ligam.
  financas: false,
  beta: false,
};

/** O que cada plano NÃO tem. Mesma lista no site (iftech: src/lib/mesas-planos.ts). */
export const PLANO_DESLIGA = {
  basico: ["viagem", "estoque", "relatorios", "qr-pedido", "chamar-garcom", "pedir-conta"],
  completo: ["qr-pedido", "chamar-garcom", "pedir-conta"],
  premium: [],
};
/** Funções novas que só o plano liga (sem plano, ficam desligadas). */
export const PLANO_LIGA = { basico: [], completo: ["financas"], premium: ["pedido-online", "financas"] };
export const NOME_PLANO = { basico: "Básico", completo: "Completo", premium: "Premium" };
let planoAtual = null;

let atual = {};
let lojaAtual = null;
let sair = null;
const ouvintes = new Set();

function acompanhar() {
  const id = MULTI ? getLoja() : null;
  if (!id || id === lojaAtual) return;
  lojaAtual = id;
  sair?.();
  sair = onSnapshot(
    doc(db, "mesasLojas", id, "configuracoes", "recursos"),
    (s) => {
      atual = (s.exists() && s.data().recursos) || {};
      planoAtual = (s.exists() && PLANO_DESLIGA[s.data().plano] && s.data().plano) || null;
      ouvintes.forEach((fn) => fn());
    },
    () => {}
  );
}

export function temRecurso(nome) {
  const padrao = RECURSOS[nome] ?? false;
  if (!MULTI) return padrao;
  acompanhar();
  if (typeof atual[nome] === "boolean") return atual[nome];
  if (planoAtual && PLANO_LIGA[planoAtual].includes(nome)) return true;
  if (planoAtual && PLANO_DESLIGA[planoAtual].includes(nome)) return false;
  // Primeiros recursos foram gravados no cadastro da loja (mesasLojas/<id>.recursos).
  const antigo = getTenant().loja?.recursos?.[nome];
  return typeof antigo === "boolean" ? antigo : padrao;
}

export function useRecurso(nome) {
  const [ligado, setLigado] = useState(() => temRecurso(nome));
  useEffect(() => {
    const fn = () => setLigado(temRecurso(nome));
    fn();
    ouvintes.add(fn);
    const sairTenant = subscribeTenant(fn);
    return () => {
      ouvintes.delete(fn);
      sairTenant();
    };
  }, [nome]);
  return ligado;
}

/** planoQueLibera(nome) que se atualiza quando o plano da loja carrega ou muda. */
export function usePlanoQueLibera(nome) {
  const [plano, setPlano] = useState(() => planoQueLibera(nome));
  useEffect(() => {
    const fn = () => setPlano(planoQueLibera(nome));
    fn();
    ouvintes.add(fn);
    const sairTenant = subscribeTenant(fn);
    return () => {
      ouvintes.delete(fn);
      sairTenant();
    };
  }, [nome]);
  return plano;
}

/** Desligada por causa do plano? Devolve o nome do menor plano que tem a função (ex.: "Completo"); senão null. */
export function planoQueLibera(nome) {
  if (!MULTI || temRecurso(nome) || typeof atual[nome] === "boolean" || !planoAtual) return null;
  const ordem = ["basico", "completo", "premium"];
  const tem = (k) => PLANO_LIGA[k].includes(nome) || (!PLANO_DESLIGA[k].includes(nome) && RECURSOS[nome] !== false);
  if (tem(planoAtual)) return null;
  const p = ordem.find((k) => ordem.indexOf(k) > ordem.indexOf(planoAtual) && tem(k));
  return p ? NOME_PLANO[p] : null;
}
