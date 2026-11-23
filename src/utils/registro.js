// Registro de tudo o que é mexido na loja, para a dona saber: dinheiro (caixa, sangria, pagamentos, despesas),
// comida (compras, perdas, contagens, o que cada venda tirou do estoque e o que NÃO tirou e por quê),
// pedidos (lançou, tirou, alterou, encerrou, cancelou) e cardápio (preço, produto novo, apagado).
//
// registro/<id>: { em, dia, area: "dinheiro" | "comida" | "pedidos" | "cardapio", acao, texto, valor?, motivo?,
//                  mesa?, antes?, depois?, detalhes?: [texto], por, aparelho }
// Só é criado: ninguém da equipe edita nem apaga (regras do banco). Nunca trava a tela se falhar.
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { L } from "../loja";

export const AREAS = {
  dinheiro: { nome: "Dinheiro", emoji: "💰" },
  comida: { nome: "Comida e estoque", emoji: "🥘" },
  pedidos: { nome: "Pedidos e mesas", emoji: "🧾" },
  cardapio: { nome: "Cardápio e preços", emoji: "🍔" },
};

const diaDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const quemFez = () => auth?.currentUser?.email || auth?.currentUser?.displayName || "";
const aparelho = () => {
  try {
    return localStorage.getItem("iftech_nome_aparelho") || localStorage.getItem("iftech_aparelho") || "";
  } catch {
    return "";
  }
};
const limpo = (v, n = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Grava uma linha no registro. dados: { area, acao, texto, valor?, motivo?, mesa?, antes?, depois?, detalhes? }. */
export function registrar(dados) {
  try {
    const agora = new Date();
    const linha = {
      em: agora.toISOString(),
      dia: diaDe(agora),
      area: AREAS[dados.area] ? dados.area : "pedidos",
      acao: limpo(dados.acao, 40),
      texto: limpo(dados.texto, 300),
      ...(Number.isFinite(Number(dados.valor)) && dados.valor !== null && dados.valor !== undefined ? { valor: Math.round(Number(dados.valor) * 100) / 100 } : {}),
      ...(dados.motivo ? { motivo: limpo(dados.motivo, 160) } : {}),
      ...(dados.mesa ? { mesa: Number(dados.mesa) || String(dados.mesa) } : {}),
      ...(dados.antes !== undefined ? { antes: limpo(dados.antes, 120) } : {}),
      ...(dados.depois !== undefined ? { depois: limpo(dados.depois, 120) } : {}),
      ...(Array.isArray(dados.detalhes) && dados.detalhes.length ? { detalhes: dados.detalhes.slice(0, 40).map((d) => limpo(d, 160)) } : {}),
      por: quemFez(),
      aparelho: limpo(aparelho(), 40),
      criadoEm: serverTimestamp(),
    };
    return addDoc(collection(db, ...L(), "registro"), linha).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

/** Motivos rápidos para tirar ou mudar algo da comanda (o garçom toca um; "Outro" abre o texto). */
export const MOTIVOS_PEDIDO = ["Cliente desistiu", "Lançado errado", "Cliente trocou de prato", "Demorou demais", "Saiu errado da cozinha", "Cortesia da casa"];
