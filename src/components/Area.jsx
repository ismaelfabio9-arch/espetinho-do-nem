// Área do sistema (Vendas, Cardápio e estoque): um título, as abas e a tela da aba escolhida.
// A aba fica no endereço (?aba=…), então os links antigos (/caixa, /historico…) caem na aba certa.
import { Link, useSearchParams } from "react-router-dom";
import SeLigado from "./SeLigado";
import { useRecursos } from "../recursos";
import "../styles/Garcom/Area.css";

/**
 * abas: [{ id, nome, recurso?, tela: () => JSX }]. padrao: id da aba quando o endereço não diz.
 * recurso pode ser uma lista (a aba aparece se a loja tiver qualquer uma). Aba de função que o plano
 * da loja não tem nem aparece.
 */
export default function Area({ titulo, icone, texto, abas: todas, padrao, param = "aba", sub = false }) {
  const [params, setParams] = useSearchParams();
  const nomes = [...new Set(todas.flatMap((a) => (a.recurso ? [].concat(a.recurso) : [])))];
  const ligados = useRecursos(nomes);
  const tem = (a) => !a.recurso || [].concat(a.recurso).some((r) => ligados[r]);
  const visiveis = todas.filter(tem);
  // Nenhuma aba no plano (entrou pelo endereço): mostra o aviso da primeira.
  const abas = visiveis.length ? visiveis : todas.slice(0, 1);
  const atual = abas.find((a) => a.id === params.get(param)) || abas.find((a) => a.id === padrao) || abas[0];
  const escolher = (id) => {
    const p = new URLSearchParams(params);
    p.set(param, id);
    if (!sub) p.delete("sub");
    setParams(p, { replace: true });
  };
  const barra = (
    <div className={sub ? "area-sub" : "area-abas"} role="tablist" aria-label={titulo}>
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={a.id === atual.id} className={a.id === atual.id ? "ativa" : ""} onClick={() => escolher(a.id)}>
          {a.nome}
        </button>
      ))}
    </div>
  );
  const tela = atual.recurso && !tem(atual) ? (
    <SeLigado recurso={[].concat(atual.recurso)[0]} embutido>
      {atual.tela()}
    </SeLigado>
  ) : (
    atual.tela()
  );
  if (sub)
    return (
      <div className="area-sub-bloco">
        {barra}
        <div className="area-conteudo">{tela}</div>
      </div>
    );
  return (
    <div className="area">
      <header className="area-topo">
        <Link to="/" className="voltar">← Painel</Link>
        <h1>
          <span aria-hidden="true">{icone}</span> {titulo}
        </h1>
        {texto && <p>{texto}</p>}
        {barra}
      </header>
      <div className="area-conteudo" key={atual.id}>{tela}</div>
    </div>
  );
}
