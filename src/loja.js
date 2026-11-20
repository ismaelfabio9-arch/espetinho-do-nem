// Sistema de Mesas da IFTech: a mesma base serve uma loja só (instalação própria) ou várias
// lojas criadas pelo site da IFTech (REACT_APP_MULTI=1, em iftechpe.com.br/mesas).
// Em várias lojas, os dados de cada uma ficam em mesasLojas/<id>/<coleção> no Firebase da IFTech.
export const MULTI = process.env.REACT_APP_MULTI === "1";

let lojaId = null;
export function setLoja(id) {
  lojaId = id;
}
export function getLoja() {
  return lojaId;
}

/** Prefixo do caminho no Firestore: [] numa loja só; ["mesasLojas", id] em várias lojas. */
export function L() {
  if (!MULTI) return [];
  if (!lojaId) throw new Error("Loja não definida");
  return ["mesasLojas", lojaId];
}

/** Link do cardápio online da loja (pedido de casa, plano Premium). Só nas lojas da IFTech. */
export function cardapioOnlineUrl() {
  return MULTI ? `${window.location.origin}/mesas/c/${lojaId}/cardapio` : null;
}

/** Link do cardápio de uma mesa (é o que vai no QR Code). */
export function mesaUrl(numero) {
  const origem = window.location.origin;
  return MULTI ? `${origem}/mesas/c/${lojaId}/mesa-cliente/${numero}` : `${origem}/mesa-cliente/${numero}`;
}
