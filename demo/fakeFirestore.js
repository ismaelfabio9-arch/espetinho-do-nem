// Substitui "firebase/firestore" na demonstração do site da IFTech.
// Guarda as coleções só no navegador (localStorage) e avisa as telas em tempo
// real, como o Firestore faria. Cobre o que as telas usam: collection, doc,
// query/where/orderBy, onSnapshot, getDoc(s), addDoc, setDoc (merge),
// updateDoc, deleteDoc, writeBatch e serverTimestamp.

export const STORAGE_KEY = "iftech_demo_mesas_v1";

class Timestamp {
  constructor(ms) {
    this._ms = ms;
  }
  static now() {
    return new Timestamp(Date.now());
  }
  static fromDate(d) {
    return new Timestamp(d.getTime());
  }
  get seconds() {
    return Math.floor(this._ms / 1000);
  }
  get nanoseconds() {
    return (this._ms % 1000) * 1e6;
  }
  toDate() {
    return new Date(this._ms);
  }
  toMillis() {
    return this._ms;
  }
  valueOf() {
    return this._ms;
  }
  toJSON() {
    return { __ts: this._ms };
  }
}
export { Timestamp };

const revive = (_k, v) => (v && typeof v === "object" && typeof v.__ts === "number" ? new Timestamp(v.__ts) : v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v), revive));

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw, revive).cols || {} : {};
  } catch {
    return {};
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, at: Date.now(), cols: data }));
    } catch {
      /* sem espaço ou bloqueado: a demonstração segue só na memória */
    }
  }, 150);
}

/** Troca todo o conteúdo (usado pela loja de exemplo e pelo "Recomeçar"). */
export function demoReplaceAll(cols) {
  data = clone(cols);
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, at: Date.now(), cols: data }));
  } catch {
    /* idem */
  }
  notify();
}

export function demoHasData() {
  return Object.keys(data).length > 0;
}

// Outra aba (ex.: o cardápio do cliente aberto ao lado) mudou os dados.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    data = load();
    notify();
  });
}

// ---------- referências ----------

export function getFirestore() {
  return { type: "firestore" };
}

function newId() {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 20; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function colRef(name) {
  return { type: "collection", id: name, path: name };
}

function docRef(col, id) {
  return { type: "document", id: String(id), path: `${col}/${id}`, parent: colRef(col) };
}

export function collection(_db, name) {
  return colRef(name);
}

export function doc(first, ...rest) {
  // doc(db, "col", "id") | doc(colRef) | doc(colRef, "id")
  if (first && first.type === "collection") return docRef(first.id, rest.length ? rest[0] : newId());
  return docRef(rest[0], rest[1]);
}

export function where(field, op, value) {
  return { kind: "where", field, op, value };
}

export function orderBy(field, dir = "asc") {
  return { kind: "orderBy", field, dir };
}

export function limit(n) {
  return { kind: "limit", n };
}

export function query(ref, ...constraints) {
  const base = ref.type === "query" ? ref : { type: "query", col: ref.id, constraints: [] };
  return { ...base, constraints: [...base.constraints, ...constraints] };
}

// ---------- leitura ----------

function getField(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function cmp(a, b) {
  const x = a instanceof Timestamp ? a.valueOf() : a;
  const y = b instanceof Timestamp ? b.valueOf() : b;
  if (typeof x === "string" && typeof y === "string") return x < y ? -1 : x > y ? 1 : 0;
  return x < y ? -1 : x > y ? 1 : 0;
}

function matches(d, w) {
  const v = getField(d, w.field);
  switch (w.op) {
    case "==":
      return cmp(v, w.value) === 0 && v !== undefined;
    case "!=":
      return v !== undefined && cmp(v, w.value) !== 0;
    case "<":
      return v !== undefined && cmp(v, w.value) < 0;
    case "<=":
      return v !== undefined && cmp(v, w.value) <= 0;
    case ">":
      return v !== undefined && cmp(v, w.value) > 0;
    case ">=":
      return v !== undefined && cmp(v, w.value) >= 0;
    case "in":
      return (w.value || []).some((x) => cmp(v, x) === 0);
    case "not-in":
      return v !== undefined && !(w.value || []).some((x) => cmp(v, x) === 0);
    case "array-contains":
      return Array.isArray(v) && v.some((x) => cmp(x, w.value) === 0);
    case "array-contains-any":
      return Array.isArray(v) && v.some((x) => (w.value || []).some((y) => cmp(x, y) === 0));
    default:
      return true;
  }
}

function runQuery(q) {
  const col = data[q.col] || {};
  let rows = Object.entries(col).map(([id, d]) => ({ id, d }));
  for (const c of q.constraints) if (c.kind === "where") rows = rows.filter((r) => matches(r.d, c));
  const orders = q.constraints.filter((c) => c.kind === "orderBy");
  // Como no Firestore: quem não tem o campo do orderBy fica de fora.
  for (const o of orders) rows = rows.filter((r) => getField(r.d, o.field) !== undefined);
  if (orders.length) {
    rows.sort((a, b) => {
      for (const o of orders) {
        const r = cmp(getField(a.d, o.field), getField(b.d, o.field));
        if (r) return o.dir === "desc" ? -r : r;
      }
      return 0;
    });
  }
  const lim = q.constraints.find((c) => c.kind === "limit");
  if (lim) rows = rows.slice(0, lim.n);
  return rows.map((r) => docSnap(docRef(q.col, r.id), r.d));
}

function docSnap(ref, d) {
  const copy = clone(d);
  return {
    id: ref.id,
    ref,
    exists: () => copy !== undefined,
    data: () => clone(copy),
    get: (f) => clone(getField(copy, f)),
  };
}

function querySnap(docs, changes) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (fn) => docs.forEach(fn),
    docChanges: () => changes,
  };
}

function asQuery(ref) {
  return ref.type === "query" ? ref : { type: "query", col: ref.id, constraints: [] };
}

export async function getDocs(ref) {
  const docs = runQuery(asQuery(ref));
  return querySnap(
    docs,
    docs.map((doc, i) => ({ type: "added", doc, oldIndex: -1, newIndex: i }))
  );
}

export async function getDoc(ref) {
  return docSnap(ref, (data[ref.parent.id] || {})[ref.id]);
}

// ---------- tempo real ----------

const listeners = new Set();
let pending = false;

function notify() {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    listeners.forEach((l) => l.run());
  }, 0);
}

export function onSnapshot(ref, next, error) {
  const onNext = typeof next === "function" ? next : next && next.next;
  const onError = typeof next === "function" ? error : next && next.error;
  const l = { last: null, active: true };
  l.run = () => {
    if (!l.active) return;
    try {
      if (ref.type === "document") {
        const d = (data[ref.parent.id] || {})[ref.id];
        const key = JSON.stringify(d ?? null);
        if (key === l.last) return;
        l.last = key;
        onNext(docSnap(ref, d));
        return;
      }
      const docs = runQuery(asQuery(ref));
      const now = new Map(docs.map((s) => [s.id, JSON.stringify(s.data())]));
      const key = JSON.stringify([...now]);
      if (key === l.lastKey) return;
      const before = l.last || new Map();
      const changes = [];
      docs.forEach((s, i) => {
        if (!before.has(s.id)) changes.push({ type: "added", doc: s, oldIndex: -1, newIndex: i });
        else if (before.get(s.id) !== now.get(s.id)) changes.push({ type: "modified", doc: s, oldIndex: i, newIndex: i });
      });
      for (const id of before.keys()) {
        if (!now.has(id)) changes.push({ type: "removed", doc: docSnap(docRef(asQuery(ref).col, id), undefined), oldIndex: 0, newIndex: -1 });
      }
      l.last = now;
      l.lastKey = key;
      onNext(querySnap(docs, changes));
    } catch (e) {
      if (onError) onError(e);
      else console.error(e);
    }
  };
  listeners.add(l);
  setTimeout(l.run, 0);
  return () => {
    l.active = false;
    listeners.delete(l);
  };
}

// ---------- escrita ----------

export function serverTimestamp() {
  return Timestamp.now();
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp);
}

function deepMerge(target, src) {
  const out = { ...(target || {}) };
  for (const [k, v] of Object.entries(src)) out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  keys.slice(0, -1).forEach((k) => {
    if (!isPlainObject(o[k])) o[k] = {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
}

function applySet(ref, value, options) {
  const col = (data[ref.parent.id] = data[ref.parent.id] || {});
  const v = clone(value);
  col[ref.id] = options && options.merge ? deepMerge(col[ref.id], v) : v;
}

function applyUpdate(ref, value) {
  const col = data[ref.parent.id] || {};
  if (!col[ref.id]) throw new Error(`No document to update: ${ref.path}`);
  const d = clone(col[ref.id]);
  for (const [k, v] of Object.entries(clone(value))) setPath(d, k, v);
  col[ref.id] = d;
}

function applyDelete(ref) {
  const col = data[ref.parent.id];
  if (col) delete col[ref.id];
}

function committed() {
  save();
  notify();
}

export async function setDoc(ref, value, options) {
  applySet(ref, value, options);
  committed();
}

export async function updateDoc(ref, value) {
  applyUpdate(ref, value);
  committed();
}

export async function deleteDoc(ref) {
  applyDelete(ref);
  committed();
}

export async function addDoc(col, value) {
  const ref = docRef(col.id, newId());
  applySet(ref, value);
  committed();
  return ref;
}

export function writeBatch() {
  const ops = [];
  const batch = {
    set: (ref, value, options) => (ops.push(() => applySet(ref, value, options)), batch),
    update: (ref, value) => (ops.push(() => applyUpdate(ref, value)), batch),
    delete: (ref) => (ops.push(() => applyDelete(ref)), batch),
    commit: async () => {
      const backup = clone(data);
      try {
        ops.forEach((op) => op());
      } catch (e) {
        data = backup;
        throw e;
      }
      committed();
    },
  };
  return batch;
}
