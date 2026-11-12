import { L, MULTI } from "../loja";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export const CONFIG_IMPRESSORA_PADRAO = {
  habilitada: true,
  autoImprimirPedido: false,
  autoImprimirComprovante: false,
  larguraPapel: "58mm",
  // Nas lojas do site da IFTech o nome vem da contratação (gravado em configuracoes/impressora).
  nomeEstabelecimento: MULTI ? "" : "Espetinho do Nem",
  endereco: "",
  telefone: "",
  mensagemRodape: "Obrigado pela preferência!",
};

export function useConfigImpressora() {
  const [config, setConfig] = useState(CONFIG_IMPRESSORA_PADRAO);

  useEffect(() => {
    const cancelar = onSnapshot(doc(db, ...L(), "configuracoes", "impressora"), (snap) => {
      if (snap.exists()) {
        setConfig({ ...CONFIG_IMPRESSORA_PADRAO, ...snap.data() });
      } else {
        setConfig(CONFIG_IMPRESSORA_PADRAO);
      }
    });

    return () => cancelar();
  }, []);

  return config;
}
