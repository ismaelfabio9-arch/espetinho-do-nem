// Fotos dos produtos (planos Completo e Premium: recurso "fotos").
// Cada foto fica em fotos/<produtoId> { img: "data:image/webp;base64,…", atualizadoEm } — separada do
// produto para a lista de produtos continuar leve. O cliente da mesa e o cardápio online leem (regras).
// A foto é reduzida no próprio celular (até 640 px, ~60–150 KB) antes de salvar: sem serviço pago de arquivos.
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { L } from "../loja";

const LADO = 640;
const MAX = 220000; // tamanho máximo do texto da imagem (as regras aceitam até 300 mil)

function carregar(file) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      erro(new Error("Não deu para abrir essa imagem. Tente outra foto (JPG ou PNG)."));
    };
    img.src = url;
  });
}

/** Reduz a foto (quadrada no centro, até 640 px) e devolve o texto da imagem (webp, ou jpeg se o aparelho não fizer webp). */
export async function prepararFoto(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Escolha uma foto.");
  const img = await carregar(file);
  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  if (!lado) throw new Error("Não deu para abrir essa imagem.");
  const final = Math.min(LADO, lado);
  const canvas = document.createElement("canvas");
  canvas.width = final;
  canvas.height = final;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, final, final);
  ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, final, final);
  for (const q of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    let dado = canvas.toDataURL("image/webp", q);
    if (!dado.startsWith("data:image/webp")) dado = canvas.toDataURL("image/jpeg", q);
    if (dado.length <= MAX) return dado;
  }
  throw new Error("A foto ficou grande demais. Tente outra foto.");
}

export const salvarFoto = (produtoId, img) => setDoc(doc(db, ...L(), "fotos", produtoId), { img, atualizadoEm: new Date().toISOString() });
export const apagarFoto = (produtoId) => deleteDoc(doc(db, ...L(), "fotos", produtoId));

/** { produtoId: img } das fotos da loja (vazio quando a função está desligada). */
export function useFotos(ligado = true) {
  const [fotos, setFotos] = useState({});
  useEffect(() => {
    if (!ligado) {
      setFotos({});
      return undefined;
    }
    return onSnapshot(
      collection(db, ...L(), "fotos"),
      (s) => setFotos(Object.fromEntries(s.docs.map((d) => [d.id, d.data().img]).filter(([, img]) => typeof img === "string"))),
      () => setFotos({})
    );
  }, [ligado]);
  return fotos;
}
