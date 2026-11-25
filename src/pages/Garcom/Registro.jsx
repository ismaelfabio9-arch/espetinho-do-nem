// "O que foi mexido": tudo o que aconteceu na loja, para a dona — dinheiro (caixa, sangria, pagamentos,
// despesas), comida (compras, perdas, contagens, o que cada venda tirou do estoque e o que não tirou e por quê),
// pedidos (lançou, tirou com o motivo, alterou, cliente pelo QR/cardápio digital) e cardápio (preços, produtos).
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import { AREAS } from "../../utils/registro";
import { periodo } from "../../utils/financas";
import "../../styles/Garcom/Financas.css";
import "../../styles/Garcom/Registro.css";

const R = (v) => `R$ ${Math.abs(Number(v || 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const semAcento = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** O que a dona precisa olhar com atenção (dinheiro que saiu, item tirado, perda, preço mudado…). */
const ATENCAO = /tirou|diminuiu|desfez|sangria|apagou|perda|sa[ií]da sem venda|contagem|mudou o pre[cç]o|zerou|fechou o caixa|sem baixa/i;
const PERIODOS = [
  { id: "hoje", nome: "Hoje" },
  { id: "ontem", nome: "Ontem" },
  { id: "7dias", nome: "7 dias" },
  { id: "mes", nome: "Este mês" },
  { id: "mesPassado", nome: "Mês passado" },
];
function faixa(id) {
  if (id !== "ontem") return periodo(id);
  const d = new Date(Date.now() - 86400000);
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { de: s, ate: s };
}
const diaBonito = (s) => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
};

export default function Registro({ emRelatorio = false }) {
  const [per, setPer] = useState("hoje");
  const [area, setArea] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [busca, setBusca] = useState("");
  const [soAtencao, setSoAtencao] = useState(false);
  const [aberta, setAberto] = useState(null);
  const [lista, setLista] = useState(null);
  const f = faixa(per);

  useEffect(() => {
    setLista(null);
    return onSnapshot(
      query(collection(db, ...L(), "registro"), where("dia", ">=", f.de), where("dia", "<=", f.ate)),
      (s) => setLista(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.em).localeCompare(String(a.em)))),
      () => setLista([])
    );
  }, [f.de, f.ate]);

  const pessoas = useMemo(() => [...new Set((lista || []).map((r) => r.por || "sem nome"))].sort(), [lista]);
  const filtrada = useMemo(() => {
    const q = semAcento(busca.trim());
    return (lista || []).filter(
      (r) =>
        (!area || r.area === area) &&
        (!pessoa || (r.por || "sem nome") === pessoa) &&
        (!soAtencao || ATENCAO.test(r.acao)) &&
        (!q || semAcento(`${r.acao} ${r.texto} ${r.motivo || ""} ${(r.detalhes || []).join(" ")} ${r.mesa ? `mesa ${r.mesa}` : ""}`).includes(q))
    );
  }, [lista, area, pessoa, busca, soAtencao]);

  // Resumo do período: o que mais importa para a dona.
  const resumo = useMemo(() => {
    const l = lista || [];
    const soma = (re) => l.filter((r) => re.test(r.acao)).reduce((s, r) => s + Math.abs(Number(r.valor || 0)), 0);
    const conta = (re) => l.filter((r) => re.test(r.acao)).length;
    return [
      { nome: "Sangrias", valor: soma(/^sangria$/i), vezes: conta(/^sangria$/i), cor: "neg" },
      { nome: "Tirado da comanda", valor: soma(/tirou da comanda|diminuiu/i), vezes: conta(/tirou da comanda|diminuiu/i), cor: "neg" },
      { nome: "Pagamentos desfeitos", valor: soma(/desfez/i), vezes: conta(/desfez/i), cor: "neg" },
      { nome: "Perdas e saídas de comida", valor: soma(/perda|sa[ií]da sem venda/i), vezes: conta(/perda|sa[ií]da sem venda/i), cor: "neg" },
      { nome: "Compras de ingrediente", valor: soma(/^compra$/i), vezes: conta(/^compra$/i), cor: "" },
      { nome: "Preços mudados", valor: null, vezes: conta(/mudou o pre[cç]o/i), cor: "" },
    ].filter((x) => x.vezes > 0);
  }, [lista]);

  // Agrupa por dia.
  const dias = useMemo(() => {
    const m = new Map();
    filtrada.forEach((r) => {
      if (!m.has(r.dia)) m.set(r.dia, []);
      m.get(r.dia).push(r);
    });
    return [...m.entries()];
  }, [filtrada]);

  const contaArea = (id) => (lista || []).filter((r) => r.area === id).length;
  const nAtencao = (lista || []).filter((r) => ATENCAO.test(r.acao)).length;
  const quem = (por) => {
    const t = String(por || "").trim();
    if (!t) return "sem nome";
    if (t.startsWith("Cliente")) return t;
    return t.split("@")[0];
  };
  const naoSaiu = (r) => (r.detalhes || []).filter((d) => /não saiu|sem ficha|não baixou/i.test(d)).length;
  const ehBaixa = (r) => /baixou o estoque|sem baixa|baixa do estoque/i.test(r.acao);

  return (
    <div className={emRelatorio ? "reg rel-parte" : "reg"}>
      {!emRelatorio && (
        <div className="reg-topo">
          <h2>O que foi mexido</h2>
          <button type="button" className="reg-imprimir" onClick={() => window.print()}>Imprimir</button>
        </div>
      )}

      <div className="reg-faixa" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <button key={p.id} className={per === p.id ? "on" : ""} onClick={() => setPer(p.id)}>{p.nome}</button>
        ))}
      </div>

      {resumo.length > 0 && (
        <div className="reg-resumo">
          {resumo.map((x) => (
            <div key={x.nome} className={`reg-card ${x.cor}`}>
              <small>{x.nome}</small>
              <b>{x.valor !== null ? R(x.valor) : x.vezes}</b>
              <span>{x.vezes} {x.vezes === 1 ? "vez" : "vezes"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="reg-faixa reg-areas" role="group" aria-label="Área">
        <button className={!area && !soAtencao ? "on" : ""} onClick={() => { setArea(""); setSoAtencao(false); }}>Tudo <i>{(lista || []).length}</i></button>
        <button className={`atencao${soAtencao ? " on" : ""}`} onClick={() => setSoAtencao((v) => !v)}>Atenção <i>{nAtencao}</i></button>
        {Object.entries(AREAS).map(([id, a]) => (
          <button key={id} className={area === id ? "on" : ""} onClick={() => setArea(area === id ? "" : id)}>
            {a.nome.split(" ")[0]} <i>{contaArea(id)}</i>
          </button>
        ))}
      </div>

      <div className="reg-linha">
        <input type="search" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {pessoas.length > 1 && (
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Quem fez">
            <option value="">Todos</option>
            {pessoas.map((p) => (
              <option key={p} value={p}>{quem(p)}</option>
            ))}
          </select>
        )}
      </div>

      {lista === null ? (
        <p className="fin-carregando"><span className="girando" aria-hidden="true" />Carregando…</p>
      ) : !dias.length ? (
        <p className="reg-vazio">Nada registrado {per === "hoje" ? "hoje" : "neste período"}{area || pessoa || busca || soAtencao ? " com esse filtro" : ""}.</p>
      ) : (
        dias.map(([dia, itens]) => (
          <section key={dia} className="reg-dia">
            <h3>{diaBonito(dia)} <small>{itens.length} {itens.length === 1 ? "registro" : "registros"}</small></h3>
            <ul>
              {itens.map((r) => {
                const a = AREAS[r.area] || AREAS.pedidos;
                const atencao = ATENCAO.test(r.acao);
                const det = r.detalhes || [];
                const aberto = aberta === r.id;
                const nao = naoSaiu(r);
                const baixa = ehBaixa(r);
                return (
                  <li key={r.id} className={`reg-item area-${r.area}${atencao ? " atencao" : ""}${aberto ? " aberto" : ""}`} onClick={() => setAberto(aberto ? null : r.id)}>
                    <div className="reg-txt">
                      <div className="reg-l1">
                        <strong>
                          {baixa ? "Baixa do estoque" : r.acao}
                          {r.mesa ? <em> · Mesa {r.mesa}</em> : null}
                        </strong>
                        {typeof r.valor === "number" && r.valor !== 0 && <span className={`reg-valor ${r.valor < 0 ? "neg" : ""}`}>{r.valor < 0 ? "−" : ""}{R(r.valor)}</span>}
                      </div>
                      {r.texto && !baixa && <p className="reg-texto">{r.texto}</p>}
                      {baixa && (
                        <p className="reg-texto">
                          {det.filter((d) => d.startsWith("Saiu ")).length} {det.filter((d) => d.startsWith("Saiu ")).length === 1 ? "ingrediente" : "ingredientes"}
                          {nao > 0 && <b className="reg-nao">, {nao} {nao === 1 ? "não saiu" : "não saíram"}</b>}
                        </p>
                      )}
                      {(r.antes || r.depois) && (
                        <p className="reg-mudou">
                          {r.antes ? <s>{r.antes}</s> : null} {r.antes && r.depois ? "→" : ""} {r.depois ? <b>{r.depois}</b> : null}
                        </p>
                      )}
                      {r.motivo && <p className="reg-motivo">Motivo: {r.motivo}</p>}
                      {aberto && (
                        <div className="reg-mais">
                          {baixa && r.texto && <p className="reg-texto-todo">{r.texto}</p>}
                          {det.length > 0 && (
                            <ul className="reg-det">
                              {det.map((d, k) => (
                                <li key={k} className={/não saiu|sem ficha|não baixou/i.test(d) ? "nao" : ""}>{d}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      <small className="reg-rodape">
                        {new Date(r.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {quem(r.por)} · {a.nome}
                        {det.length > 0 || (r.texto || "").length > 90 ? <span className="reg-ver"> · {aberto ? "Ocultar" : "Detalhes"}</span> : null}
                      </small>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
