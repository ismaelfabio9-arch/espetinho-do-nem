// Painel do Dono: para quem tem 2 ou mais lojas do Sistema de Mesas (combo). Cada loja continua
// separada; aqui o dono vê cada uma e o total somado, sem calculadora. O login é só desta tela e
// fica na memória: saiu, fechou ou trocou de aba, o painel fecha e pede o login de novo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { authDono, dbDono, entrarDono, sairDono } from "../../donoAuth";
import { TIPOS_VENDA, moeda, nomeProduto, qtdItem, resumir, tipoVenda } from "../../utils/tipoVenda";
import "../../styles/Garcom/PainelDono.css";

const PERIODOS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7", rotulo: "7 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "tudo", rotulo: "Tudo" },
];

// "21/11/2026" → Date
const dataBR = (s) => {
  const [d, m, a] = String(s || "").split("/").map(Number);
  return a ? new Date(a, m - 1, d) : null;
};

/** Vendas da loja no período: os dias fechados (relatório) e o dia de hoje, ainda aberto. */
function vendasNoPeriodo(loja, periodo) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const desde = periodo === "tudo" ? null : periodo === "hoje" ? hoje : new Date(hoje.getTime() - (Number(periodo) - 1) * 86400000);
  const fechados = periodo === "hoje" ? [] : loja.dias.filter((d) => {
    const dt = dataBR(d.data);
    return dt && (!desde || dt >= desde);
  });
  return [...fechados.flatMap((d) => d.vendasDia || []), ...loja.hoje];
}

export default function PainelDono() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState("");
  const [lojas, setLojas] = useState(null);
  const [periodo, setPeriodo] = useState("hoje");
  const [aberta, setAberta] = useState(null);

  // Sai do painel: encerra o login do dono (não fica salvo) e volta.
  const fechar = useCallback(() => {
    sairDono();
    setUser(null);
    setLojas(null);
  }, []);

  useEffect(() => onAuthStateChanged(authDono, (u) => setUser(u)), []);
  // Saiu da tela, trocou de aba ou fechou: o acesso acaba.
  useEffect(() => {
    const some = () => document.visibilityState === "hidden" && fechar();
    document.addEventListener("visibilitychange", some);
    window.addEventListener("pagehide", fechar);
    return () => {
      document.removeEventListener("visibilitychange", some);
      window.removeEventListener("pagehide", fechar);
      sairDono();
    };
  }, [fechar]);

  const carregar = useCallback(async (u) => {
    setErro("");
    setLojas(null);
    try {
      const email = String(u.email || "").toLowerCase();
      const snap = await getDocs(query(collection(dbDono, "mesasLojas"), where("memberEmails", "array-contains", email)));
      const minhas = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((l) => String(l.ownerEmail || "").toLowerCase() === email && l.active === true)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
      const comDados = await Promise.all(
        minhas.map(async (l) => {
          const [dias, hoje] = await Promise.all([
            getDocs(collection(dbDono, "mesasLojas", l.id, "relatorioGerencial")),
            getDocs(collection(dbDono, "mesasLojas", l.id, "vendasDia")),
          ]);
          return { id: l.id, nome: l.name || "Loja", dias: dias.docs.map((d) => d.data()), hoje: hoje.docs.map((d) => d.data()) };
        })
      );
      setLojas(comDados);
    } catch (e) {
      console.error("Painel do Dono:", e);
      setErro("Não foi possível carregar as lojas. Confira a internet e tente de novo.");
      setLojas([]);
    }
  }, []);

  useEffect(() => {
    if (user) carregar(user);
  }, [user, carregar]);

  async function entrar() {
    setEntrando(true);
    setErro("");
    try {
      await entrarDono();
    } catch (e) {
      if (e?.code !== "auth/popup-closed-by-user") setErro("Não deu para entrar. Abra no navegador (Chrome) e tente de novo.");
    }
    setEntrando(false);
  }

  const dados = useMemo(() => {
    if (!lojas) return null;
    const porLoja = lojas.map((l) => {
      const vendas = vendasNoPeriodo(l, periodo);
      const r = resumir(vendas);
      const tipos = Object.fromEntries(TIPOS_VENDA.map((t) => [t.id, resumir(vendas.filter((v) => tipoVenda(v) === t.id)).total]));
      return { ...l, vendas, r, tipos };
    });
    const todas = porLoja.flatMap((l) => l.vendas);
    const total = resumir(todas);
    const tiposTotal = Object.fromEntries(TIPOS_VENDA.map((t) => [t.id, porLoja.reduce((s, l) => s + l.tipos[t.id], 0)]));
    // Produtos: quantidade em cada loja e o total.
    const prod = {};
    porLoja.forEach((l, i) =>
      l.vendas.forEach((v) =>
        (v.itens || []).forEach((it) => {
          const nome = nomeProduto(it);
          if (!prod[nome]) prod[nome] = { nome, porLoja: porLoja.map(() => 0), qtd: 0, total: 0 };
          const q = qtdItem(it);
          prod[nome].porLoja[i] += q;
          prod[nome].qtd += q;
          prod[nome].total += Number(it.preco || 0) * q;
        })
      )
    );
    return { porLoja, total, tiposTotal, produtos: Object.values(prod).sort((a, b) => b.total - a.total) };
  }, [lojas, periodo]);

  const nomePeriodo = PERIODOS.find((p) => p.id === periodo)?.rotulo;

  return (
    <div className="container dono-pagina">
      <div className="no-print">
        <button type="button" className="voltar" onClick={() => { fechar(); navigate("/config"); }}>← Voltar</button>
      </div>

      {!user ? (
        <div className="dono-entrar">
          <div className="dono-icone" aria-hidden="true">🏪</div>
          <h1>Painel do Dono</h1>
          <p>Cada uma das suas lojas e o total somado, num lugar só. Só o dono entra, com a conta Google dele.</p>
          <p className="dono-aviso">🔒 O acesso não fica salvo neste aparelho: saiu desta tela, ele fecha.</p>
          <button type="button" className="dono-btn" onClick={entrar} disabled={entrando}>
            {entrando ? <><span className="girando" aria-hidden="true" />Entrando…</> : "Entrar com a conta do dono"}
          </button>
          {erro && <p className="dono-erro">{erro}</p>}
        </div>
      ) : !dados ? (
        <p className="dono-carregando"><span className="girando" aria-hidden="true" />Carregando as lojas…</p>
      ) : dados.porLoja.length < 2 ? (
        <div className="dono-entrar">
          <div className="dono-icone" aria-hidden="true">🏪</div>
          <h1>Painel do Dono</h1>
          <p>
            {dados.porLoja.length === 0
              ? `Não achamos lojas no nome de ${user.email}.`
              : `O Painel do Dono é para quem tem 2 ou mais lojas. ${user.email} tem 1 loja.`}{" "}
            Para abrir outra loja com 20% de desconto, vá em Minha conta no site da IFTech.
          </p>
          {erro && <p className="dono-erro">{erro}</p>}
          <button type="button" className="dono-btn secundario" onClick={fechar}>Sair</button>
        </div>
      ) : (
        <>
          <div className="dono-topo">
            <div>
              <span>Painel do Dono · {dados.porLoja.length} lojas</span>
              <h1>Suas lojas</h1>
              <small>{user.email}</small>
            </div>
            <div className="dono-acoes no-print">
              <button type="button" className="dono-btn secundario" onClick={() => carregar(user)}>Atualizar</button>
              <button type="button" className="dono-btn secundario" onClick={() => window.print()}>PDF</button>
              <button type="button" className="dono-btn sair" onClick={fechar}>Sair</button>
            </div>
          </div>

          <div className="pedidos-filtros no-print" role="tablist" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} className={periodo === p.id ? "ativo" : ""} onClick={() => setPeriodo(p.id)}>
                {p.rotulo}
              </button>
            ))}
          </div>
          <p className="dono-periodo">
            Período: <strong>{nomePeriodo}</strong>
            {periodo === "hoje" ? " (vendas finalizadas hoje, antes de fechar o dia)" : " (dias fechados + hoje)"}
          </p>

          <div className="dono-cards">
            <div className="destaque"><span>Faturamento das lojas</span><strong>R$ {moeda(dados.total.total)}</strong></div>
            <div><span>Pedidos</span><strong>{dados.total.pedidos}</strong></div>
            <div><span>Ticket médio</span><strong>R$ {moeda(dados.total.ticket)}</strong></div>
          </div>

          <h2 className="dono-h2">Cada loja e o total</h2>
          <div className="dono-tabela-caixa">
            <table className="dono-tabela">
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Pedidos</th>
                  <th>Ticket</th>
                  {TIPOS_VENDA.map((t) => <th key={t.id}>{t.nome}</th>)}
                  <th>Faturamento</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {dados.porLoja.map((l) => (
                  <tr key={l.id}>
                    <td>{l.nome}</td>
                    <td>{l.r.pedidos}</td>
                    <td>R$ {moeda(l.r.ticket)}</td>
                    {TIPOS_VENDA.map((t) => <td key={t.id}>R$ {moeda(l.tipos[t.id])}</td>)}
                    <td>R$ {moeda(l.r.total)}</td>
                    <td>{dados.total.total > 0 ? Math.round((l.r.total / dados.total.total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{dados.total.pedidos}</td>
                  <td>R$ {moeda(dados.total.ticket)}</td>
                  {TIPOS_VENDA.map((t) => <td key={t.id}>R$ {moeda(dados.tiposTotal[t.id])}</td>)}
                  <td>R$ {moeda(dados.total.total)}</td>
                  <td>{dados.total.total > 0 ? "100%" : "0%"}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h2 className="dono-h2">Loja por loja</h2>
          <div className="dono-lojas">
            {dados.porLoja.map((l) => (
              <section key={l.id} className="dono-loja">
                <button type="button" className="dono-loja-topo" onClick={() => setAberta(aberta === l.id ? null : l.id)} aria-expanded={aberta === l.id}>
                  <span>
                    <strong>{l.nome}</strong>
                    <small>{l.r.pedidos} pedidos · {l.r.itens} itens</small>
                  </span>
                  <b>R$ {moeda(l.r.total)}</b>
                </button>
                {(
                  <div className={aberta === l.id ? "dono-loja-corpo" : "dono-loja-corpo fechado"}>
                    {l.r.produtos.length === 0 ? (
                      <p className="dono-vazio">Sem vendas neste período.</p>
                    ) : (
                      l.r.produtos.slice(0, 8).map((p) => (
                        <div key={p.nome} className="hist-linha">
                          <span className="hist-qtd">{p.qtd}x</span>
                          <span className="hist-nome">{p.nome}</span>
                          <span className="hist-valor">R$ {moeda(p.total)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>

          <h2 className="dono-h2">Produtos em todas as lojas</h2>
          {dados.produtos.length === 0 ? (
            <p className="dono-vazio">Sem vendas neste período.</p>
          ) : (
            <div className="dono-tabela-caixa">
              <table className="dono-tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    {dados.porLoja.map((l) => <th key={l.id}>{l.nome}</th>)}
                    <th>Qtd</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.produtos.map((p) => (
                    <tr key={p.nome}>
                      <td>{p.nome}</td>
                      {p.porLoja.map((q, i) => <td key={i}>{q || "–"}</td>)}
                      <td>{p.qtd}</td>
                      <td>R$ {moeda(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="dono-rodape">Gerado em {new Date().toLocaleString("pt-BR")} · Painel do Dono · IFTech</p>
        </>
      )}
      {!user && <p className="dono-rodape no-print"><Link to="/config">Voltar para Configurações</Link></p>}
    </div>
  );
}
