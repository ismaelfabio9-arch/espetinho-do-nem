// Recursos por loja (Central da Loja no Admin da IFTech). Todas as lojas rodam o mesmo sistema;
// o que muda de uma loja para outra fica em mesasLojas/<id>/configuracoes/recursos:
//   { recursos: { "qr-pedido": false, "beta": true, ... } }
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
  beta: false,
};

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
