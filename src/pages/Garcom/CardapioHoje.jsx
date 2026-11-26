// Cardápio de hoje: o dono liga e desliga o que tem hoje. O que estiver desligado some da tela do
// garçom e do QR Code da mesa (fica guardado; é só ligar de novo).
// Cardápio automático: cada categoria pode ter horário (Almoço das 10:00 às 16:00, Pizzas a partir das
// 16:00) e cada produto os dias da semana em que entra. Ligar ou desligar na mão um produto que tem
// horário vale só para hoje; amanhã volta o automático.
// Horários da loja (turnos): a dona cria uma vez (Almoço 10:00 às 16:00, Noite a partir das 16:00) e liga
// cada categoria ao seu. configuracoes/turnos = { lista: [{ id, nome, de, ate, dias }] }; a categoria guarda
// turno (id) e uma cópia do horário (categoria.horario), que é o que o garçom e o cliente usam.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { L } from "../../loja";
import { ordenarGruposPorCategoria } from "../../utils/categorias";
import { ordenarItensCategoria } from "../../utils/produtosOrdem";
import { DIAS, categoriaNoHorario, disponivelAgora, hojeISO, noHorario, pelaRegra, temHorario, textoDias, textoHorario, useMinuto } from "../../utils/horario";
import { registrar } from "../../utils/registro";
import "./CardapioHoje.css";

const moeda = (v) => Number(v || 0).toFixed(2).replace(".", ",");

export default function CardapioHoje() {
  const [produtos, setProdutos] = useState([]);
  const [categoriasDocs, setCategoriasDocs] = useState([]);
  const [editando, setEditando] = useState(null); // nome da categoria com o horário aberto
  const [diasDe, setDiasDe] = useState(null); // id do produto com os dias abertos
  useMinuto();

  useEffect(() => onSnapshot(collection(db, ...L(), "categorias"), (s) => setCategoriasDocs(s.docs.map((d) => ({ id: d.id, ...d.data() })))), []);
  useEffect(() => onSnapshot(collection(db, ...L(), "produtos"), (s) => setProdutos(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.ativo !== false))), []);
  const [turnos, setTurnos] = useState([]);
  useEffect(() => onSnapshot(doc(db, ...L(), "configuracoes", "turnos"), (s) => setTurnos(Array.isArray(s.data()?.lista) ? s.data().lista : []), () => setTurnos([])), []);

  /** Liga a categoria a um horário da loja ("" = o dia todo). */
  async function ligarTurno(cd, valor) {
    if (valor === "outro") return setEditando(cd.nome);
    const t = turnos.find((x) => x.id === valor);
    const horario = t ? { de: t.de || "", ate: t.ate || "", dias: t.dias || [] } : null;
    await setDoc(doc(db, ...L(), "categorias", cd.id), { turno: t ? t.id : null, horario, atualizadoEm: new Date().toISOString() }, { merge: true });
    registrar({ area: "cardapio", acao: "Mudou o horário da categoria", texto: cd.nome, depois: t ? `${t.nome} (${textoHorario(horario)})` : "o dia todo" });
  }

  const grupos = useMemo(() => {
    const g = {};
    produtos.forEach((p) => {
      const c = p.categoria || "Sem categoria";
      (g[c] = g[c] || { categoria: c, itens: [] }).itens.push(p);
    });
    const lista = Object.values(g);
    lista.forEach((c) => (c.itens = ordenarItensCategoria(c.itens)));
    return ordenarGruposPorCategoria(lista, categoriasDocs);
  }, [produtos, categoriasDocs]);

  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const ligado = (p) => disponivelAgora(p, categoriasDocs);
  const ligados = produtos.filter(ligado).length;
  const catDoc = (nome) => categoriasDocs.find((c) => c.nome === nome) || null;

  // Produto com horário: a mudança na mão vale só hoje. Sem horário: fica até mudar (como sempre foi).
  function mudar(p, ligar) {
    if (temHorario(p, categoriasDocs)) {
      const igualRegra = ligar === pelaRegra(p, categoriasDocs);
      return setDoc(doc(db, ...L(), "produtos", p.id), { ligadoHoje: igualRegra ? null : { dia: hojeISO(), ligado: ligar }, ...(ligar ? { foraHoje: false } : {}) }, { merge: true });
    }
    return setDoc(doc(db, ...L(), "produtos", p.id), { foraHoje: !ligar }, { merge: true });
  }
  const alternar = (p) => mudar(p, !ligado(p));

  // Feriado: liga só hoje os pratos marcados "e feriado" (no dia seguinte volta sozinho ao normal).
  const deFeriado = produtos.filter((p) => p.feriado === true);
  const ehFeriado = deFeriado.length > 0 && deFeriado.every((p) => p.ligadoHoje?.dia === hojeISO() && p.ligadoHoje.ligado);
  async function feriado(ligar) {
    await Promise.all(deFeriado.map((p) => (ligar ? (pelaRegra(p, categoriasDocs) ? null : setDoc(doc(db, ...L(), "produtos", p.id), { ligadoHoje: { dia: hojeISO(), ligado: true }, foraHoje: false }, { merge: true })) : p.ligadoHoje?.dia === hojeISO() ? setDoc(doc(db, ...L(), "produtos", p.id), { ligadoHoje: null }, { merge: true }) : null)));
    registrar({ area: "cardapio", acao: ligar ? "Marcou hoje como feriado" : "Tirou o feriado de hoje", texto: `${deFeriado.length} pratos` });
  }
  const categoria = (c, ligar) => c.itens.forEach((p) => ligado(p) !== ligar && mudar(p, ligar));

  return (
    <div className="container hoje-page">
      <Link to="/produtos" className="voltar">← Voltar</Link>
      <div className="hoje-topo">
        <h1>Cardápio de hoje</h1>
        <span>{hoje}</span>
      </div>
      <p className="hoje-sub">Só o que estiver ligado aparece para o garçom e para o cliente.</p>
      {deFeriado.length > 0 && (
        <button type="button" className={ehFeriado ? "hoje-item hoje-feriado" : "hoje-item hoje-feriado off"} onClick={() => feriado(!ehFeriado)} aria-pressed={ehFeriado}>
          <span>
            <b>Hoje é feriado</b>
            <small>Liga hoje os {deFeriado.length} pratos de sábado, domingo e feriado</small>
          </span>
          <i className={ehFeriado ? "hoje-chave" : "hoje-chave off"} aria-hidden="true" />
        </button>
      )}
      <Turnos turnos={turnos} categoriasDocs={categoriasDocs} />
      {grupos.map((c) => {
        const cd = catDoc(c.categoria);
        const h = cd?.horario;
        const comHorario = noHorario(h) !== null;
        return (
          <section key={c.categoria} className="hoje-cat">
            <div className="hoje-cat-topo">
              <h2>
                {c.categoria}
                {comHorario && <small className={categoriaNoHorario(cd) ? "hoje-hr on" : "hoje-hr"}>{textoHorario(h)}{categoriaNoHorario(cd) ? " · agora" : ""}</small>}
              </h2>
              <span>
                {cd && (
                  <select className="hoje-turno" aria-label={`Horário de ${c.categoria}`} value={turnos.some((t) => t.id === cd.turno) ? cd.turno : comHorario ? "outro" : ""} onChange={(e) => ligarTurno(cd, e.target.value)}>
                    <option value="">O dia todo</option>
                    {turnos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    <option value="outro">{comHorario && !turnos.some((t) => t.id === cd.turno) ? "Horário próprio" : "Outro horário…"}</option>
                  </select>
                )}
                <button type="button" onClick={() => categoria(c, true)}>ligar todos</button>
                <button type="button" onClick={() => categoria(c, false)}>desligar todos</button>
              </span>
            </div>
            {editando === c.categoria && cd && <EditarHorario cat={cd} fechar={() => setEditando(null)} />}
            {c.itens.map((p) => {
              const on = ligado(p);
              const auto = temHorario(p, categoriasDocs);
              const naMao = p.ligadoHoje && p.ligadoHoje.dia === hojeISO();
              return (
                <div key={p.id} className="hoje-linha">
                  <div className="hoje-linha-topo">
                  <button type="button" className={on ? "hoje-item" : "hoje-item off"} onClick={() => alternar(p)} aria-pressed={on}>
                    <span>
                      <b>{p.nome}</b>
                      <small>
                        R$ {moeda(p.preco)}
                        {textoDias(p) ? ` · ${textoDias(p)}` : ""}
                        {p.foraHoje === true ? " · desligado" : naMao && p.feriado === true && p.ligadoHoje.ligado ? " · feriado hoje" : naMao && p.soNaMao === true ? (p.ligadoHoje.ligado ? " · ligado hoje" : "") : naMao ? " · mudado na mão hoje" : auto && p.soNaMao !== true ? " · automático" : ""}
                      </small>
                    </span>
                    <i className={on ? "hoje-chave" : "hoje-chave off"} aria-hidden="true" />
                  </button>
                  <button type="button" className="hoje-dias-bt" onClick={() => setDiasDe(diasDe === p.id ? null : p.id)}>dias</button>
                  </div>
                  {diasDe === p.id && <EditarDias p={p} fechar={() => setDiasDe(null)} />}
                </div>
              );
            })}
          </section>
        );
      })}
      <Link to="/" className="hoje-pronto">Pronto · {ligados} {ligados === 1 ? "item" : "itens"} agora</Link>
    </div>
  );
}

function ChipsDias({ valor, mudar }) {
  return (
    <div className="hoje-chips">
      {DIAS.map((d, i) => {
        const on = valor.includes(i);
        return (
          <button type="button" key={d} className={on ? "on" : ""} aria-pressed={on} onClick={() => mudar(on ? valor.filter((x) => x !== i) : [...valor, i])}>
            {d}
          </button>
        );
      })}
    </div>
  );
}

/** Horário da categoria: de, até (vazio = até fechar) e os dias. */
function EditarHorario({ cat, fechar }) {
  const h = cat.horario || {};
  const [de, setDe] = useState(h.de || "");
  const [ate, setAte] = useState(h.ate || "");
  const [dias, setDias] = useState(Array.isArray(h.dias) ? h.dias : []);
  async function salvar(horario) {
    await setDoc(doc(db, ...L(), "categorias", cat.id), { horario, turno: null, atualizadoEm: new Date().toISOString() }, { merge: true });
    registrar({ area: "cardapio", acao: horario ? "Mudou o horário da categoria" : "Tirou o horário da categoria", texto: cat.nome, depois: horario ? textoHorario(horario) : "" });
    fechar();
  }
  return (
    <div className="hoje-editar">
      <div className="hoje-horas">
        <label>De<input type="time" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label>Até<input type="time" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
      </div>
      <small className="hoje-nota">Até vazio: até a loja fechar. Sem dia marcado: todos os dias.</small>
      <ChipsDias valor={dias} mudar={setDias} />
      <div className="hoje-bts">
        {cat.horario && <button type="button" onClick={() => salvar(null)}>Tirar horário</button>}
        <button type="button" className="ok" disabled={!de && !ate && !dias.length} onClick={() => salvar({ de, ate, dias })}>Salvar</button>
      </div>
    </div>
  );
}

/** Dias da semana em que o produto entra no cardápio. */
function EditarDias({ p, fechar }) {
  const [dias, setDias] = useState(Array.isArray(p.dias) ? p.dias : []);
  const [fer, setFer] = useState(p.feriado === true);
  const [soNaMao, setSoNaMao] = useState(p.soNaMao === true);
  async function salvar() {
    const novo = { dias: soNaMao ? [] : dias, feriado: !soNaMao && fer, soNaMao };
    await setDoc(doc(db, ...L(), "produtos", p.id), novo, { merge: true });
    registrar({ area: "cardapio", acao: "Mudou os dias do produto", texto: p.nome, depois: textoDias(novo) || "todos os dias" });
    fechar();
  }
  return (
    <div className="hoje-editar">
      <small className="hoje-nota">Dias em que {p.nome} entra. Nenhum marcado: todos os dias.</small>
      <label className="hoje-check"><input type="checkbox" checked={soNaMao} onChange={(e) => setSoNaMao(e.target.checked)} /> Dias variados: só aparece quando eu ligar no dia</label>
      {!soNaMao && <ChipsDias valor={dias} mudar={setDias} />}
      {!soNaMao && <label className="hoje-check"><input type="checkbox" checked={fer} onChange={(e) => setFer(e.target.checked)} /> Também no feriado</label>}
      <div className="hoje-bts">
        <button type="button" onClick={fechar}>Cancelar</button>
        <button type="button" className="ok" onClick={salvar}>Salvar</button>
      </div>
    </div>
  );
}

/** Horários da loja: criar, mudar e apagar. Mudar um horário muda todas as categorias ligadas a ele. */
function Turnos({ turnos, categoriasDocs }) {
  const [editando, setEditando] = useState(null); // id do horário aberto ("novo" para criar)
  async function salvarLista(lista) {
    await setDoc(doc(db, ...L(), "configuracoes", "turnos"), { lista, atualizadoEm: new Date().toISOString() }, { merge: true });
  }
  async function salvar(t) {
    const lista = turnos.some((x) => x.id === t.id) ? turnos.map((x) => (x.id === t.id ? t : x)) : [...turnos, t];
    await salvarLista(lista);
    const horario = { de: t.de || "", ate: t.ate || "", dias: t.dias || [] };
    await Promise.all(categoriasDocs.filter((c) => c.turno === t.id).map((c) => setDoc(doc(db, ...L(), "categorias", c.id), { horario, atualizadoEm: new Date().toISOString() }, { merge: true })));
    registrar({ area: "cardapio", acao: "Mudou um horário da loja", texto: t.nome, depois: textoHorario(horario) });
    setEditando(null);
  }
  async function apagar(t) {
    await salvarLista(turnos.filter((x) => x.id !== t.id));
    await Promise.all(categoriasDocs.filter((c) => c.turno === t.id).map((c) => setDoc(doc(db, ...L(), "categorias", c.id), { horario: null, turno: null, atualizadoEm: new Date().toISOString() }, { merge: true })));
    registrar({ area: "cardapio", acao: "Apagou um horário da loja", texto: t.nome });
    setEditando(null);
  }
  const ligadas = (t) => categoriasDocs.filter((c) => c.turno === t.id).map((c) => c.nome);
  return (
    <section className="hoje-turnos">
      <div className="hoje-turnos-topo">
        <h2>Horários da loja</h2>
        <button type="button" onClick={() => setEditando(editando === "novo" ? null : "novo")}>+ Novo horário</button>
      </div>
      {turnos.length === 0 && editando !== "novo" && <p className="hoje-nota">Crie os horários (ex.: Almoço das 10:00 às 16:00, Noite a partir das 16:00) e escolha em cada categoria qual é o dela.</p>}
      {turnos.map((t) => (
        <div key={t.id}>
          <button type="button" className="hoje-turno-linha" onClick={() => setEditando(editando === t.id ? null : t.id)}>
            <b>{t.nome}</b>
            <span>{textoHorario(t) || "sem horário"}</span>
            <small>{ligadas(t).length ? ligadas(t).join(", ") : "nenhuma categoria ainda"}</small>
          </button>
          {editando === t.id && <EditarTurno t={t} salvar={salvar} apagar={() => apagar(t)} fechar={() => setEditando(null)} />}
        </div>
      ))}
      {editando === "novo" && <EditarTurno t={{ id: `t${Date.now().toString(36)}`, nome: "", de: "", ate: "", dias: [] }} salvar={salvar} fechar={() => setEditando(null)} />}
    </section>
  );
}

function EditarTurno({ t, salvar, apagar, fechar }) {
  const [nome, setNome] = useState(t.nome);
  const [de, setDe] = useState(t.de || "");
  const [ate, setAte] = useState(t.ate || "");
  const [dias, setDias] = useState(Array.isArray(t.dias) ? t.dias : []);
  const ok = nome.trim() && (de || ate);
  return (
    <div className="hoje-editar">
      <label className="hoje-nome">Nome<input value={nome} maxLength={30} placeholder="Ex.: Almoço, Noite" onChange={(e) => setNome(e.target.value)} /></label>
      <div className="hoje-horas">
        <label>De<input type="time" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label>Até<input type="time" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
      </div>
      <small className="hoje-nota">Até vazio: até a loja fechar. Sem dia marcado: todos os dias.</small>
      <ChipsDias valor={dias} mudar={setDias} />
      <div className="hoje-bts">
        {apagar && <button type="button" onClick={apagar}>Apagar</button>}
        <button type="button" onClick={fechar}>Cancelar</button>
        <button type="button" className="ok" disabled={!ok} onClick={() => salvar({ id: t.id, nome: nome.trim().slice(0, 30), de, ate, dias })}>Salvar</button>
      </div>
    </div>
  );
}
