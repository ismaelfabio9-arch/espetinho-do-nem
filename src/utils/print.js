// ============================================================
// utils/print.js
// Geração e disparo de impressão de comandas/comprovantes.
//
// IMPORTANTE — leia antes de alterar:
// A impressora do estabelecimento (Balhuo City) é uma impressora
// térmica portátil que se conecta por Bluetooth clássico (SPP).
// O navegador NÃO tem acesso direto a esse tipo de conexão — a API
// Web Bluetooth só fala com dispositivos BLE (GATT), não com
// Bluetooth clássico/SPP, que é o que esse modelo usa.
//
// Por isso a impressão real acontece via window.print() do navegador,
// formatada para largura de papel térmico. Isso funciona de verdade
// quando o celular/computador tem um serviço de impressão instalado
// que enxerga a impressora pareada como uma impressora do sistema
// (ex: apps genéricos de "Bluetooth Print Service" no Android, comuns
// para esse tipo de impressora). Sem esse serviço instalado, o diálogo
// de impressão do navegador não vai listar a impressora térmica — isso
// depende de configuração do dispositivo, não do código do sistema.
//
// Este módulo NÃO inventa um driver nem finge que a impressão física
// aconteceu: ele gera o documento real e aciona o diálogo de impressão
// nativo do navegador, que é o mecanismo tecnicamente correto e
// disponível para todo navegador, com ou sem impressora térmica.
// ============================================================

import { formatarMoeda } from "./texto";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { L, getLoja } from "../loja";

const CHAVE_SESSAO = "espetinho_impressos";

function lerRegistroImpressos() {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || "{}");
  } catch {
    return {};
  }
}

/** Evita reimprimir automaticamente o mesmo documento (ex: re-render de snapshot). */
export function jaImprimiu(chave) {
  const registro = lerRegistroImpressos();
  return Boolean(registro[chave]);
}

export function marcarComoImpresso(chave) {
  const registro = lerRegistroImpressos();
  registro[chave] = Date.now();
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(registro));
  } catch {
    // sessionStorage indisponível — segue sem persistir o controle
  }
}

function cabecalho(config) {
  return `
    <div class="linha-central negrito grande">${escapeHtml(
      config?.nomeEstabelecimento || (process.env.REACT_APP_MULTI === "1" ? "" : "Espetinho do Nem")
    )}</div>
    ${config?.endereco ? `<div class="linha-central pequeno">${escapeHtml(config.endereco)}</div>` : ""}
    ${config?.telefone ? `<div class="linha-central pequeno">${escapeHtml(config.telefone)}</div>` : ""}
    <div class="separador"></div>
  `;
}

/** "Prato — a, b (c, d), e" → ["Prato", "a", "b (c, d)", "e"]: o que vem no prato, um embaixo do outro. */
function separarNome(nome) {
  const texto = String(nome ?? "");
  const i = texto.indexOf(" — ");
  if (i < 0) return [texto];
  const partes = [];
  let atual = "";
  let nivel = 0;
  for (const ch of texto.slice(i + 3)) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel = Math.max(0, nivel - 1);
    if (ch === "," && nivel === 0) {
      partes.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  partes.push(atual.trim());
  return [texto.slice(0, i), ...partes.filter(Boolean)];
}

const maiuscula = (t) => {
  const x = String(t ?? "").trim();
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : "";
};

/** O que vem no prato, um por linha: "+1 Feijão Mulato", "Sem cebola", "Obs: pouco sal". */
function detalhesDoItem(item, doNome) {
  const m = item.montagem;
  if (!m || typeof m !== "object" || Array.isArray(m)) return doNome.map((d) => (/^(sem |obs)/i.test(d) ? maiuscula(d) : `+1 ${maiuscula(d.replace(/^\+\s*/, ""))}`));
  const lista = [];
  Object.values(m.escolhas || {}).forEach((v) => (Array.isArray(v) ? v : v ? [v] : []).forEach((o) => lista.push(`+1 ${maiuscula(o)}`)));
  (m.tirar || []).forEach((t) => lista.push(`Sem ${String(t).toLowerCase()}`));
  (m.extras || []).forEach((e) => lista.push(`+1 ${maiuscula(e)}`));
  (m.outros || []).forEach((o) => lista.push(`+1 ${maiuscula(o?.nome)}`));
  if (m.obs) lista.push(`Obs: ${m.obs}`);
  return lista;
}

function linhasDeItens(itens) {
  return itens
    .map((item, n) => {
      const qtd = Number(item.qtd ?? item.quantidade ?? 0);
      const preco = Number(item.preco || 0);
      const subtotal = qtd * preco;
      const [nomeLido, ...doNome] = separarNome(item.nome);
      const nome = item.nomeBase || nomeLido;
      const detalhes = detalhesDoItem(item, doNome);
      return `
        <div class="linha-item"${n > 0 ? ' style="margin-top:6px"' : ""}>
          <span>${qtd}x ${escapeHtml(nome)}</span>
          <span>R$ ${formatarMoeda(subtotal)}</span>
        </div>
        ${detalhes.map((d) => `<div class="detalhe">${escapeHtml(d)}</div>`).join("")}
      `;
    })
    .join("");
}

function escapeHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Documento 1 — Comanda/Pedido (uso interno: cozinha/atendimento). */
export function gerarComandaHTML({ numeroPedido, mesa, titulo, cliente, itens, total, observacoes, config }) {
  const agora = new Date();
  return `
    ${cabecalho(config)}
    <div class="linha-central negrito grande">COMANDA</div>
    ${numeroPedido ? `<div class="linha-central">Pedido #${escapeHtml(numeroPedido)}</div>` : ""}
    <div class="linha-central negrito">${titulo ? escapeHtml(titulo) : `MESA ${escapeHtml(mesa)}`}</div>
    ${cliente ? `<div class="linha-central">Cliente: ${escapeHtml(cliente)}</div>` : ""}
    <div class="separador"></div>
    ${linhasDeItens(itens)}
    <div class="separador"></div>
    <div class="linha-item negrito grande">
      <span>TOTAL</span>
      <span>R$ ${formatarMoeda(total)}</span>
    </div>
    ${observacoes ? `<div class="separador"></div><div class="pequeno">Obs: ${escapeHtml(observacoes)}</div>` : ""}
    <div class="separador"></div>
    <div class="linha-central pequeno">
      ${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR")}
    </div>
  `;
}

/** Resumo do dia (ao encerrar o dia): total, pedidos, mais vendidos e como pagaram. r = calcularResumoDia(). */
export function gerarResumoDiaHTML(r, config) {
  const agora = new Date();
  const linha = (a, b, cls = "") => `<div class="linha-item ${cls}"><span>${escapeHtml(a)}</span><span>${escapeHtml(b)}</span></div>`;
  return `
    ${cabecalho(config)}
    <div class="linha-central negrito grande">RESUMO DO DIA</div>
    <div class="linha-central pequeno">${escapeHtml(r.data)}${r.de ? ` · ${escapeHtml(r.de)} às ${escapeHtml(r.ate)}` : ""}</div>
    <div class="separador"></div>
    <div class="linha-central pequeno">TOTAL VENDIDO</div>
    <div class="linha-central negrito grande">R$ ${formatarMoeda(r.total)}</div>
    <div class="separador"></div>
    ${linha("Pedidos", String(r.pedidos))}
    ${linha("Itens vendidos", String(r.itens))}
    ${linha("Mesas atendidas", String(r.mesas))}
    ${linha("Balcão / viagem", String(r.balcao))}
    ${linha("Ticket médio", `R$ ${formatarMoeda(r.ticket)}`)}
    <div class="separador"></div>
    <div class="linha-central negrito">MAIS VENDIDOS</div>
    ${r.produtos.length ? r.produtos.slice(0, 20).map((p, k) => `<div class="linha-item"><span>${k + 1}. ${escapeHtml(p.qtd)}x ${escapeHtml(p.nome)}</span><span>${formatarMoeda(p.total)}</span></div>`).join("") : '<div class="linha-central pequeno">Nenhuma venda</div>'}
    ${r.formas.length ? `<div class="separador"></div><div class="linha-central negrito">COMO PAGARAM</div>${r.formas.map((f) => linha(f.forma, `R$ ${formatarMoeda(f.valor)}`)).join("")}` : ""}
    ${r.fechadasNoEncerramento ? `<div class="separador"></div><div class="pequeno">${escapeHtml(r.fechadasNoEncerramento)} mesa(s) fechada(s) no encerramento do dia sem forma de pagamento.</div>` : ""}
    ${r.gaveta ? `<div class="separador"></div><div class="linha-central negrito">GAVETA</div>${linha("Abriu com", `R$ ${formatarMoeda(r.gaveta.inicial)}`)}${linha("Vendas em dinheiro", `R$ ${formatarMoeda(r.gaveta.dinheiro)}`)}${(r.gaveta.movimentos || []).map((m) => linha(`${m.tipo === "sangria" ? "Sangria" : "Reforço"}${m.motivo ? ` (${m.motivo})` : ""}`, `${m.tipo === "sangria" ? "-" : "+"} R$ ${formatarMoeda(m.valor)}`)).join("")}${linha("Tem na gaveta", `R$ ${formatarMoeda(r.gaveta.esperado)}`, "negrito")}${typeof r.ficaNoCaixa === "number" ? linha("Fica na gaveta", `R$ ${formatarMoeda(r.ficaNoCaixa)}`) : ""}${r.paraCaixaLoja ? linha("Vai para o caixa do mês", `R$ ${formatarMoeda(r.paraCaixaLoja)}`) : ""}${r.donaTirou ? linha("Dona tirou", `R$ ${formatarMoeda(r.donaTirou)}`) : ""}` : ""}
    ${r.saidas && r.saidas.length ? `<div class="separador"></div><div class="linha-central negrito">SAIDA DE ALIMENTO</div>${r.saidas.map((x) => linha(`${x.texto}${x.motivo ? ` - ${x.motivo.toLowerCase()}` : ""}`, x.qtd || `R$ ${formatarMoeda(x.valor)}`)).join("")}${linha("Perdido", `R$ ${formatarMoeda(r.saidasTotal)}`, "negrito")}` : ""}
    ${r.acabou && r.acabou.length ? `<div class="separador"></div><div class="linha-central negrito">ACABOU</div>${r.acabou.map((a) => linha(a.nome, a.em ? new Date(a.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "")).join("")}` : ""}
    ${r.mexido && (r.mexido.tirados || r.mexido.saiuDiferente || r.mexido.cortesias) ? `<div class="separador"></div><div class="linha-central negrito">NAS COMANDAS</div>${r.mexido.tirados ? linha("Itens tirados", `${r.mexido.tirados} - R$ ${formatarMoeda(r.mexido.tiradosValor)}`) : ""}${r.mexido.saiuDiferente ? linha("Saiu diferente", String(r.mexido.saiuDiferente)) : ""}${r.mexido.cortesias ? linha("Cortesias", `${r.mexido.cortesias} - R$ ${formatarMoeda(r.mexido.cortesiasValor)}`) : ""}` : ""}
    <div class="separador"></div>
    <div class="linha-central pequeno">Impresso em ${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR")}</div>
  `;
}

/** Documento 2 — Comprovante de consumo (entregue ao cliente). */
export function gerarComprovanteHTML({ mesa, cliente, itens, total, formaPagamento, config, taxaCartao = 0, taxaPct = 0 }) {
  const agora = new Date();
  return `
    ${cabecalho(config)}
    <div class="linha-central negrito grande">COMPROVANTE DE CONSUMO</div>
    <div class="linha-central negrito">MESA ${escapeHtml(mesa)}</div>
    ${cliente ? `<div class="linha-central">Cliente: ${escapeHtml(cliente)}</div>` : ""}
    <div class="separador"></div>
    ${linhasDeItens(itens)}
    <div class="separador"></div>
    ${
      taxaCartao > 0
        ? `<div class="linha-item"><span>Subtotal</span><span>R$ ${formatarMoeda(total)}</span></div>
    <div class="linha-item"><span>Taxa do cartão (${String(taxaPct).replace(".", ",")}%)</span><span>R$ ${formatarMoeda(taxaCartao)}</span></div>`
        : ""
    }
    <div class="linha-item negrito grande">
      <span>TOTAL</span>
      <span>R$ ${formatarMoeda(total + taxaCartao)}</span>
    </div>
    ${formaPagamento ? `<div class="linha-central">Pagamento: ${escapeHtml(formaPagamento)}</div>` : ""}
    <div class="separador"></div>
    <div class="linha-central pequeno">
      ${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR")}
    </div>
    <div class="separador"></div>
    <div class="linha-central pequeno">
      ${escapeHtml(config?.mensagemRodape || "Obrigado pela preferência!")}
    </div>
    <div class="linha-central pequeno" style="margin-top:8px;">
      Comprovante de consumo — não é documento fiscal.
    </div>
  `;
}

// ------------------------------------------------------------
// Imprimir pelo computador: a impressora fica ligada num computador com o sistema aberto
// e ele imprime o que os celulares mandam (coleção "impressoes" da loja). Cada aparelho
// sabe se ele é "o computador da impressora" (guardado só nele); a loja inteira sabe se a
// função está ligada (configuracoes/impressora.imprimirNoPc) e quando o computador deu
// sinal de vida pela última vez (estacaoImpressao/pc).
// ------------------------------------------------------------
let mandarParaPc = false;
let sinalPcMs = 0;
export const SEM_SINAL_PC_MS = 3 * 60 * 1000;

export function configurarImpressaoRemota(ligado) {
  mandarParaPc = Boolean(ligado);
}

export function registrarSinalPc(ms) {
  sinalPcMs = Number(ms) || 0;
}

function chaveEstePc() {
  return "impressora_neste_pc_" + (getLoja() || "loja");
}

export function esteAparelhoImprime() {
  try {
    return localStorage.getItem(chaveEstePc()) === "1";
  } catch {
    return false;
  }
}

export function definirEsteAparelhoImprime(ligado) {
  try {
    if (ligado) localStorage.setItem(chaveEstePc(), "1");
    else localStorage.removeItem(chaveEstePc());
  } catch {
    // sem localStorage: fica só nesta abertura
  }
  window.dispatchEvent(new Event("estacao-impressao"));
}

function aviso(texto, cor) {
  try {
    const el = document.createElement("div");
    el.textContent = texto;
    el.setAttribute("role", "status");
    el.style.cssText =
      "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:" + cor +
      ";color:#fff;padding:12px 16px;border-radius:12px;font-weight:700;font-size:15px;z-index:99999;" +
      "max-width:90vw;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.25)";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  } catch {
    // sem aviso na tela
  }
}

function enviarParaPc(conteudoHTML, larguraPapel) {
  // Não espera o servidor: sem internet o Firebase guarda e manda quando voltar.
  addDoc(collection(db, ...L(), "impressoes"), {
    status: "pendente",
    html: conteudoHTML,
    larguraPapel,
    criadoMs: Date.now(),
    criadoEm: serverTimestamp(),
  }).catch((erro) => {
    console.error("Erro ao mandar para o computador:", erro);
    aviso("Não deu para mandar para o computador. Tente de novo.", "#b91c1c");
  });
  if (Date.now() - sinalPcMs < SEM_SINAL_PC_MS) {
    aviso("🖨️ Enviado para a impressora do computador", "#15803d");
  } else {
    aviso("⚠️ O computador da impressora está sem sinal. A comanda sai quando o sistema estiver aberto nele.", "#b45309");
  }
  return true;
}

/**
 * Imprime: manda para o computador da impressora quando essa função está ligada
 * (e este aparelho não é ele); senão abre a impressão aqui mesmo.
 */
export async function imprimir(conteudoHTML, larguraPapel = "58mm") {
  if (mandarParaPc && !esteAparelhoImprime()) return enviarParaPc(conteudoHTML, larguraPapel);
  return imprimirAqui(conteudoHTML, larguraPapel);
}

/**
 * Abre a janela de impressão do navegador com o conteúdo formatado
 * para impressora térmica. Retorna uma Promise que resolve quando o
 * diálogo de impressão foi acionado (não garante que a impressão
 * física foi concluída — isso depende do driver do dispositivo).
 *
 * O cupom vai como IMAGEM só em preto e branco puro, no tamanho de pontos da
 * impressora térmica (203 dpi: 576 pontos no papel de 80 mm, 384 no de 58 mm).
 * Texto do navegador tem bordas em cinza (suavização); o driver da térmica
 * transforma esse cinza em pontinhos espalhados e a letra sai fraca/falhada.
 * Sem cinza nenhum, cada ponto é queimado por inteiro. Se algo falhar, imprime
 * o texto normal (o HTML com fonte grossa) como antes.
 */
export function imprimirAqui(conteudoHTML, larguraPapel = "58mm", semJanela = false) {
  return new Promise(function (resolve) {
    var largura = larguraPapel === "80mm" ? 302 : 219; // ~80mm e ~58mm a 96dpi
    var pontos = larguraPapel === "80mm" ? 576 : 384; // pontos da cabeça térmica (203 dpi)
    // semJanela: o computador que recebe a comanda do celular imprime sem ninguém tocar
    // nele, e o navegador bloqueia janela nova sem toque; um quadro escondido na página serve.
    var quadro = null;
    var janela;
    if (semJanela) {
      quadro = document.createElement("iframe");
      quadro.setAttribute("aria-hidden", "true");
      quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(quadro);
      janela = quadro.contentWindow;
    } else {
      janela = window.open("", "_blank", "width=380,height=600");
    }

    if (!janela) {
      resolve(false);
      return;
    }

    janela.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Impressão</title><style>' +
        "@page { margin: 0; size: " + largura + "px auto; }" +
        "* { box-sizing: border-box; }" +
        "html, body { margin: 0; background: #fff; }" +
        // Fonte em negrito: vale para a cópia em texto (se a imagem falhar) e para medir a imagem.
        "body { width: " + largura + "px; margin: 0 auto; padding: 10px 8px 24px; font-family: Arial, Helvetica, sans-serif;" +
        " font-size: 14px; line-height: 1.3; font-weight: 700; color: #000;" +
        " -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
        ".linha-central { text-align: center; }" +
        ".negrito { font-weight: 700; }" +
        ".grande { font-size: 18px; }" +
        ".pequeno { font-size: 12px; }" +
        ".separador { border-top: 2px dashed #000; margin: 8px 0; }" +
        ".detalhe { font-size: 14px; font-weight: 400; padding: 1px 0; }" +
        ".linha-item { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }" +
        ".cupom-imagem { display: block; width: " + largura + "px; margin: 0 auto; image-rendering: pixelated; }" +
        // Botão para sair da tela de impressão (no celular a janela fica por cima do sistema).
        ".voltar-sistema { position: sticky; top: 0; z-index: 10; display: block; width: 100%; margin: 0 0 10px;" +
        " padding: 16px; border: 0; background: #1d4ed8; color: #fff; font: 700 18px Arial, sans-serif; -webkit-text-stroke: 0; }" +
        "@media print { .voltar-sistema { display: none !important; } }" +
        "</style></head><body>" + conteudoHTML + "</body></html>"
    );
    janela.document.close();

    // Volta ao sistema: fecha a janela de impressão; se o aparelho não deixar fechar, abre o
    // sistema nela mesma, para nunca ficar preso na tela do cupom.
    var enderecoSistema = window.location.href;
    function voltarAoSistema() {
      try {
        janela.close();
      } catch (e) {
        // segue para o plano B
      }
      setTimeout(function () {
        try {
          if (!janela.closed) janela.location.replace(enderecoSistema);
        } catch (e) {
          // janela já fechada
        }
      }, 400);
    }
    function botaoVoltar() {
      if (quadro) return;
      try {
        var doc = janela.document;
        if (doc.querySelector(".voltar-sistema")) return;
        var botao = doc.createElement("button");
        botao.type = "button";
        botao.className = "voltar-sistema";
        botao.textContent = "← Voltar ao sistema";
        botao.onclick = voltarAoSistema;
        doc.body.insertBefore(botao, doc.body.firstChild);
      } catch (e) {
        // sem botão
      }
    }
    botaoVoltar();

    // Celular: a tela de impressão do Android/iPhone abre por cima da aba do cupom. Quando a pessoa
    // imprime (ou cancela) e volta, a aba fica visível de novo: aí fecha sozinha e volta ao sistema.
    // Também fecha se a pessoa voltar direto para o sistema (a aba do cupom ficaria esquecida aberta).
    var fechou = false;
    function fecharUmaVez() {
      if (fechou) return;
      fechou = true;
      voltarAoSistema();
    }
    function fecharAoVoltar() {
      var saiu = false;
      try {
        janela.document.addEventListener("visibilitychange", function () {
          if (janela.document.hidden) saiu = true;
          else if (saiu) setTimeout(fecharUmaVez, 600);
        });
        janela.addEventListener("blur", function () {
          saiu = true;
        });
        janela.addEventListener("focus", function () {
          if (saiu) setTimeout(fecharUmaVez, 600);
        });
      } catch (e) {
        // fica o botão Voltar
      }
      function sistemaDeVolta() {
        if (document.visibilityState === "visible" && !janela.closed) setTimeout(fecharUmaVez, 300);
      }
      document.addEventListener("visibilitychange", sistemaDeVolta);
      window.addEventListener("focus", sistemaDeVolta);
      setTimeout(function () {
        document.removeEventListener("visibilitychange", sistemaDeVolta);
        window.removeEventListener("focus", sistemaDeVolta);
      }, 10 * 60 * 1000);
    }

    var disparado = false;
    function disparar() {
      if (disparado) return;
      disparado = true;
      try {
        janela.focus();
        var inicio = Date.now();
        if (!quadro) fecharAoVoltar();
        janela.print();
        resolve(true);
        // No computador o print() espera a pessoa imprimir ou cancelar: aí já fecha sozinho.
        // No celular ele volta na hora (a tela de impressão abre por cima): fecha quando a pessoa volta dela.
        if (!quadro && Date.now() - inicio > 700) setTimeout(voltarAoSistema, 300);
      } catch (e) {
        resolve(false);
      }
      if (quadro) setTimeout(function () { quadro.remove(); }, 10000);
    }

    function desenharCupom() {
      var doc = janela.document;
      var corpo = doc.body;
      var escala = pontos / largura;
      var margem = 14; // px: folga nas laterais (a impressora corta a beirada do papel)
      var util = largura - margem * 2;

      // Mede no canvas com a mesma fonte do texto e quebra as linhas compridas.
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      function fonte(px, fino) {
        return (fino ? "" : "bold ") + px * escala + "px Arial, Helvetica, sans-serif";
      }
      function quebrar(texto, px, max, fino) {
        ctx.font = fonte(px, fino);
        var palavras = texto.split(" ");
        var linhas = [];
        var atual = "";
        for (var i = 0; i < palavras.length; i++) {
          var teste = atual ? atual + " " + palavras[i] : palavras[i];
          if (atual && ctx.measureText(teste).width > max * escala) {
            linhas.push(atual);
            atual = palavras[i];
          } else {
            atual = teste;
          }
        }
        if (atual) linhas.push(atual);
        return linhas.length ? linhas : [""];
      }
      function limpo(el) {
        return String(el.textContent || "").replace(/\s+/g, " ").trim();
      }
      function tamanho(el) {
        var lista = el.classList;
        return lista.contains("grande") ? 18 : lista.contains("pequeno") ? 12 : 14;
      }

      // Monta a lista do que desenhar (y em px de tela).
      var comandos = [];
      var y = 10;
      var blocos = corpo.children;
      for (var b = 0; b < blocos.length; b++) {
        var el = blocos[b];
        if (el.classList.contains("voltar-sistema")) continue; // o botão não vai no cupom
        var mt = parseFloat(el.style.marginTop) || 0;
        y += mt;
        if (el.classList.contains("separador")) {
          y += 8;
          comandos.push({ tipo: "tracejado", y: y });
          y += 2 + 8;
          continue;
        }
        var px = tamanho(el);
        var alturaLinha = Math.round(px * 1.3);
        if (el.classList.contains("linha-item")) {
          var partes = el.children;
          var direita = partes.length > 1 ? limpo(partes[partes.length - 1]) : "";
          var esquerda = partes.length > 1 ? limpo(partes[0]) : limpo(el);
          ctx.font = fonte(px);
          var larguraDireita = direita ? ctx.measureText(direita).width / escala + 8 : 0;
          var linhasEsq = quebrar(esquerda, px, util - larguraDireita);
          y += 2;
          for (var l = 0; l < linhasEsq.length; l++) {
            comandos.push({ tipo: "texto", texto: linhasEsq[l], px: px, y: y, alinhar: "left" });
            if (l === 0 && direita) comandos.push({ tipo: "texto", texto: direita, px: px, y: y, alinhar: "right" });
            y += alturaLinha;
          }
          y += 2;
          continue;
        }
        var texto = limpo(el);
        if (!texto) continue;
        var centro = el.classList.contains("linha-central");
        var fino = el.classList.contains("detalhe");
        var linhas = quebrar(texto, px, util, fino);
        if (fino) y += 3;
        for (var k = 0; k < linhas.length; k++) {
          comandos.push({ tipo: "texto", texto: linhas[k], px: px, y: y, alinhar: centro ? "center" : "left", fino: fino });
          y += alturaLinha;
        }
      }
      y += 24;

      canvas.width = pontos;
      canvas.height = Math.ceil(y * escala);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      ctx.strokeStyle = "#000";
      ctx.textBaseline = "top";
      for (var c = 0; c < comandos.length; c++) {
        var cmd = comandos[c];
        if (cmd.tipo === "tracejado") {
          var traco = 6 * escala;
          for (var x = margem * escala; x < (largura - margem) * escala; x += traco * 1.6) {
            ctx.fillRect(Math.round(x), Math.round(cmd.y * escala), Math.round(traco), Math.max(2, Math.round(2 * escala)));
          }
          continue;
        }
        ctx.font = fonte(cmd.px, cmd.fino);
        ctx.textAlign = cmd.alinhar;
        var xTexto = cmd.alinhar === "center" ? (largura / 2) * escala : cmd.alinhar === "right" ? (largura - margem) * escala : margem * escala;
        var yTexto = (cmd.y + (cmd.px * 1.3 - cmd.px) / 2) * escala;
        ctx.fillText(cmd.texto, xTexto, yTexto);
      }

      // Preto e branco puro: sem nenhum tom de cinza.
      var imagem = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var d = imagem.data;
      for (var p = 0; p < d.length; p += 4) {
        var cor = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114 < 150 ? 0 : 255;
        d[p] = d[p + 1] = d[p + 2] = cor;
        d[p + 3] = 255;
      }
      ctx.putImageData(imagem, 0, 0);

      var img = doc.createElement("img");
      img.className = "cupom-imagem";
      img.alt = "";
      img.onload = disparar;
      img.onerror = disparar;
      img.src = canvas.toDataURL("image/png");
      corpo.style.padding = "0";
      corpo.innerHTML = "";
      corpo.appendChild(img);
      botaoVoltar();
    }

    var preparado = false;
    function preparar() {
      if (preparado) return;
      preparado = true;
      try {
        desenharCupom();
        // Se a imagem não avisar que carregou, imprime assim mesmo.
        setTimeout(disparar, 800);
      } catch (e) {
        disparar(); // imprime o texto normal
      }
    }

    janela.onload = preparar;
    // fallback caso onload não dispare em alguns navegadores mobile
    setTimeout(preparar, 400);
  });
}
