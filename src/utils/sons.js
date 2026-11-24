// Sons dos avisos da equipe: um som diferente para cada coisa, alto, tocando 2 vezes (3 segundos cada).
// Os arquivos ficam em public/sounds (no site da IFTech: /mesas/sounds/).
const BASE_SONS = (process.env.PUBLIC_URL || "") + `/sounds/`;

export const SONS = {
  online: { nome: "Pedido do cardápio digital", vibra: [400, 150, 400, 150, 400] },
  mesa: { nome: "Pedido novo pelo QR Code da mesa", vibra: [700, 200, 700] },
  acrescentou: { nome: "Mesa acrescentou itens no pedido", vibra: [150, 100, 150, 100, 150] },
  alterou: { nome: "Pedido alterado", vibra: [300, 300, 300, 300] },
  conta: { nome: "Mesa pediu a conta", vibra: [1000, 200, 1000] },
  garcom: { nome: "Mesa chamou o garçom", vibra: [500, 150, 500, 150, 500] },
};

const LIGADO = "iftech_sons_ligado";
export const sonsLigados = () => {
  try {
    return localStorage.getItem(LIGADO) !== "0";
  } catch {
    return true;
  }
};
export const ligarSons = (sim) => {
  try {
    localStorage.setItem(LIGADO, sim ? "1" : "0");
  } catch {
    /* sem armazenamento: fica ligado */
  }
};

/** Qual som toca para o aviso (avisos antigos, sem "som", pelo tipo e pela mensagem). */
export function somDoAviso(n) {
  // Pedido feito pela equipe (mesa, balcão, entrega) não toca: só o que o cliente faz.
  if (n?.equipe) return null;
  if (n?.som && SONS[n.som]) return n.som;
  if (n?.tipo === "garcom") return "garcom";
  if (n?.tipo === "pagamento") return "conta";
  if (n?.tipo === "pedido") {
    if (n.origem === "online" || /entrega|retirada/i.test(n.mensagem || "")) return "online";
    return "mesa";
  }
  return null; // estoque e outros: só aparecem na lista
}

// Um aparelho toca um aviso por vez (dois avisos juntos: o segundo espera o primeiro acabar).
let fila = Promise.resolve();
let audioAtual = null;

function tocarUmaVez(arquivo) {
  return new Promise((ok) => {
    const a = new Audio(`${BASE_SONS}${arquivo}.mp3`);
    a.volume = 1;
    audioAtual = a;
    const fim = () => ok();
    a.onended = fim;
    a.onerror = fim;
    a.play().catch(fim);
    setTimeout(fim, 4000); // nunca prende a fila
  });
}

/** Toca o som (2 vezes) e vibra. vezes: 2 nos avisos; 1 no "Ouvir" das configurações. */
export function tocarSom(som, { vezes = 2, forcar = false } = {}) {
  if (!SONS[som]) return Promise.resolve();
  if (!forcar && !sonsLigados()) return Promise.resolve();
  try {
    navigator.vibrate?.(SONS[som].vibra);
  } catch {
    /* sem vibração */
  }
  fila = fila.then(async () => {
    for (let i = 0; i < vezes; i++) {
      await tocarUmaVez(som);
      if (i < vezes - 1) await new Promise((r) => setTimeout(r, 300));
    }
  });
  return fila;
}

export const pararSom = () => {
  try {
    audioAtual?.pause();
  } catch {
    /* nada */
  }
};

/**
 * O celular só deixa tocar som depois que a pessoa toca na tela uma vez. No 1º toque, toca um som mudo
 * para liberar: depois disso os avisos tocam sozinhos.
 */
let liberado = false;
export function liberarSomNoPrimeiroToque() {
  if (liberado || typeof window === "undefined") return;
  const liberar = () => {
    if (liberado) return;
    liberado = true;
    const a = new Audio(`${BASE_SONS}mesa.mp3`);
    a.muted = true;
    a.play().then(() => a.pause()).catch(() => {});
    window.removeEventListener("pointerdown", liberar, true);
    window.removeEventListener("keydown", liberar, true);
  };
  window.addEventListener("pointerdown", liberar, true);
  window.addEventListener("keydown", liberar, true);
}

/** Este aparelho (para não tocar no celular de quem fez a alteração). */
export function meuAparelho() {
  try {
    let id = localStorage.getItem("iftech_aparelho");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem("iftech_aparelho", id);
    }
    return id;
  } catch {
    return "";
  }
}
