// Copia os sons das notificações (public/sounds) para a demonstração.
import { cpSync } from "node:fs";
cpSync(new URL("../public/sounds", import.meta.url), new URL("./dist/sounds", import.meta.url), { recursive: true });
