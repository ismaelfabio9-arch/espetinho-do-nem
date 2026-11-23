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

function linhasDeItens(itens) {
  return itens
    .map((item) => {
      const qtd = Number(item.qtd ?? item.quantidade ?? 0);
      const preco = Number(item.preco || 0);
      const subtotal = qtd * preco;
      return `
        <div class="linha-item">
          <span>${qtd}x ${escapeHtml(item.nome)}</span>
          <span>R$ ${formatarMoeda(subtotal)}</span>
        </div>
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
export function imprimir(conteudoHTML, larguraPapel = "58mm") {
  return new Promise(function (resolve) {
    var largura = larguraPapel === "80mm" ? 302 : 219; // ~80mm e ~58mm a 96dpi
    var pontos = larguraPapel === "80mm" ? 576 : 384; // pontos da cabeça térmica (203 dpi)
    var janela = window.open("", "_blank", "width=380,height=600");

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
        ".linha-item { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }" +
        ".cupom-imagem { display: block; width: " + largura + "px; margin: 0 auto; image-rendering: pixelated; }" +
        "</style></head><body>" + conteudoHTML + "</body></html>"
    );
    janela.document.close();

    var disparado = false;
    function disparar() {
      if (disparado) return;
      disparado = true;
      try {
        janela.focus();
        janela.print();
        resolve(true);
      } catch (e) {
        resolve(false);
      }
    }

    function desenharCupom() {
      var doc = janela.document;
      var corpo = doc.body;
      var escala = pontos / largura;
      var margem = 8; // px (igual ao padding lateral do body)
      var util = largura - margem * 2;

      // Mede no canvas com a mesma fonte do texto e quebra as linhas compridas.
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      function fonte(px) {
        return "bold " + px * escala + "px Arial, Helvetica, sans-serif";
      }
      function quebrar(texto, px, max) {
        ctx.font = fonte(px);
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
        var linhas = quebrar(texto, px, util);
        for (var k = 0; k < linhas.length; k++) {
          comandos.push({ tipo: "texto", texto: linhas[k], px: px, y: y, alinhar: centro ? "center" : "left" });
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
        ctx.font = fonte(cmd.px);
        ctx.textAlign = cmd.alinhar;
        var xTexto = cmd.alinhar === "center" ? (largura / 2) * escala : cmd.alinhar === "right" ? (largura - margem) * escala : margem * escala;
        var yTexto = (cmd.y + (cmd.px * 1.3 - cmd.px) / 2) * escala;
        ctx.fillText(cmd.texto, xTexto, yTexto);
      }

      // Preto e branco puro: sem nenhum tom de cinza.
      var imagem = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var d = imagem.data;
      for (var p = 0; p < d.length; p += 4) {
        var cor = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114 < 128 ? 0 : 255;
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
