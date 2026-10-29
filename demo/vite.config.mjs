// Demonstração do Sistema de Mesas no site da IFTech (/demonstracao/mesas/).
// Usa as telas de ../src sem mudar nada nelas: o Firebase é trocado por um
// banco falso que guarda tudo só no navegador (fakeFirestore.js), e o nome do
// estabelecimento real é trocado pelo da loja de exemplo.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const BASE = "/demonstracao/mesas/";
const NOME_DEMO = "Bar Modelo (demonstração)";
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

function ajustesDemo() {
  return {
    name: "ajustes-demo",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/src/")) return null;
      // Nada da configuração do Firebase do cliente vai para a demonstração.
      if (id.endsWith("/src/firebase.js")) return { code: "export const db = { type: 'firestore' };", map: null };
      let out = code
        .replaceAll("Espetinho do Nem", NOME_DEMO)
        .replaceAll("ESPETINHO DO NEM", NOME_DEMO.toUpperCase())
        .replaceAll("`/sounds/", "`" + BASE + "sounds/");
      if (id.endsWith("/src/App.js")) out = out.replaceAll("BrowserRouter", "HashRouter");
      // No computador (mouse), prender o ponteiro na categoria impedia o clique de abrir a
      // categoria do cardápio do cliente. O arrastar só vale para toque, então só prende no toque.
      if (id.endsWith("/src/pages/Cliente/CardapioMesa.jsx"))
        out = out.replace("if (evento.currentTarget.setPointerCapture) {", 'if (evento.pointerType !== "mouse" && evento.currentTarget.setPointerCapture) {');
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  root: here("./"),
  base: BASE,
  publicDir: false,
  plugins: [ajustesDemo(), react({ include: /\.(jsx?|tsx?)$/ })],
  esbuild: { loader: "jsx", include: /\.(jsx?)$/, exclude: [] },
  optimizeDeps: { esbuildOptions: { loader: { ".js": "jsx" } } },
  resolve: {
    alias: [
      { find: /^firebase\/firestore$/, replacement: here("./fakeFirestore.js") },
      { find: /^firebase\/app$/, replacement: here("./fakeApp.js") },
      // As telas ficam em ../src, fora desta pasta: usam as bibliotecas daqui.
      { find: /^(react|react-dom|react-router-dom|lucide-react)(\/.*)?$/, replacement: here("./node_modules/$1$2") },
    ],
  },
  server: { fs: { allow: [here("../")] } },
  build: { outDir: "dist", emptyOutDir: true },
});
