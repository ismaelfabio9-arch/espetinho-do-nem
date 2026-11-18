// Recursos ligados só nesta loja (o administrador da IFTech liga em Admin → Contratações).
// Todas as lojas rodam o mesmo sistema: uma mudança pedida por um cliente é programada desligada
// e só aparece onde o recurso estiver ligado. Uso numa tela:
//   const comandaSemPreco = useRecurso("comanda-sem-preco");
//   if (comandaSemPreco) { ...só nesta loja... }
// Loja única (instalação própria, sem REACT_APP_MULTI): nenhum recurso opcional.
import { useEffect, useState } from "react";
import { MULTI } from "./loja";
import { getTenant, subscribeTenant } from "./tenant";

export function temRecurso(nome) {
  if (!MULTI) return false;
  return getTenant().loja?.recursos?.[nome] === true;
}

export function useRecurso(nome) {
  const [ligado, setLigado] = useState(() => temRecurso(nome));
  useEffect(() => {
    setLigado(temRecurso(nome));
    const sair = subscribeTenant(() => setLigado(temRecurso(nome)));
    return () => {
      sair();
    };
  }, [nome]);
  return ligado;
}
