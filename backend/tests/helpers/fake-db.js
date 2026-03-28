function clone(value) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (Array.isArray(value)) {
    return value.map((item) => clone(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, clone(nested)]),
    );
  }
  return value;
}

function toComparable(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return value;
}

function matchObject(row, criteria) {
  return Object.entries(criteria).every(([key, value]) => row[key] === value);
}

class Query {
  constructor(state, table) {
    this.state = state;
    this.table = table;
    this.rows = [...(state[table] || [])];
    this.aggregate = null;
    this.groupFields = [];
  }

  materialize() {
    if (!this.aggregate) return this.rows;

    if (this.aggregate.type === "count") {
      const { alias } = this.aggregate;
      return [{ [alias]: this.rows.length }];
    }

    if (this.aggregate.type === "sum") {
      const { alias, field } = this.aggregate;
      if (!this.groupFields.length) {
        const total = this.rows.reduce(
          (sum, row) => sum + Number(row[field] || 0),
          0,
        );
        return [{ [alias]: total }];
      }

      const groups = new Map();
      for (const row of this.rows) {
        const key = JSON.stringify(this.groupFields.map((name) => row[name]));
        const existing = groups.get(key) || {
          [alias]: 0,
          ...Object.fromEntries(
            this.groupFields.map((name) => [name, row[name]]),
          ),
        };
        existing[alias] += Number(row[field] || 0);
        groups.set(key, existing);
      }
      return [...groups.values()];
    }

    return this.rows;
  }

  where(arg1, arg2, arg3) {
    if (typeof arg1 === "function") {
      arg1(this);
      return this;
    }
    if (typeof arg1 === "object") {
      this.rows = this.rows.filter((row) => matchObject(row, arg1));
      return this;
    }
    const field = arg1;
    const op = arg3 === undefined ? "=" : arg2;
    const value = arg3 === undefined ? arg2 : arg3;
    this.rows = this.rows.filter((row) => {
      const current = row[field];
      if (op === "=") return current === value;
      const left = toComparable(current);
      const right = toComparable(value);
      if (op === ">") return left > right;
      if (op === ">=") return left >= right;
      if (op === "<") return left < right;
      if (op === "<=") return left <= right;
      return current === value;
    });
    return this;
  }

  andWhere(...args) {
    return this.where(...args);
  }

  whereIn(field, values) {
    this.rows = this.rows.filter((row) => values.includes(row[field]));
    return this;
  }

  whereRaw(sql, params = []) {
    const text = String(sql || "").trim();
    const match = text.match(/^LOWER\(([^)]+)\)\s*=\s*\?$/i);
    if (match) {
      const field = match[1].trim();
      const expected = String(params[0] || "").toLowerCase();
      this.rows = this.rows.filter(
        (row) => String(row[field] || "").toLowerCase() === expected,
      );
    }
    return this;
  }

  whereNot(criteria) {
    this.rows = this.rows.filter((row) => !matchObject(row, criteria));
    return this;
  }

  whereNull(field) {
    this.rows = this.rows.filter((row) => row[field] == null);
    return this;
  }

  orWhere(criteria) {
    const base = this.state[this.table] || [];
    const additional = base.filter((row) => matchObject(row, criteria));
    const map = new Map(
      [...this.rows, ...additional].map((row) => [
        row.id || JSON.stringify(row),
        row,
      ]),
    );
    this.rows = [...map.values()];
    return this;
  }

  orWhereNull(field) {
    const base = this.state[this.table] || [];
    const additional = base.filter((row) => row[field] == null);
    const map = new Map(
      [...this.rows, ...additional].map((row) => [
        row.id || JSON.stringify(row),
        row,
      ]),
    );
    this.rows = [...map.values()];
    return this;
  }

  orderBy(field, dir = "asc") {
    this.rows = [...this.rows].sort((a, b) => {
      if (a[field] === b[field]) return 0;
      const res = a[field] > b[field] ? 1 : -1;
      return dir === "desc" ? -res : res;
    });
    return this;
  }

  limit(n) {
    this.rows = this.rows.slice(0, n);
    return this;
  }

  select() {
    return this;
  }

  sum(aliasObj) {
    const [alias, field] = Object.entries(aliasObj)[0];
    this.aggregate = { type: "sum", alias, field };
    return this;
  }

  count(aliasObj) {
    const [alias] = Object.entries(aliasObj)[0];
    this.aggregate = { type: "count", alias };
    return this;
  }

  groupBy(...fields) {
    this.groupFields = [...this.groupFields, ...fields];
    return this;
  }

  join() {
    return this;
  }

  async first() {
    return this.materialize()[0] || null;
  }

  async insert(payload) {
    const rows = Array.isArray(payload) ? payload : [payload];
    if (!this.state[this.table]) this.state[this.table] = [];
    this.state[this.table].push(...rows.map((row) => clone(row)));
    return rows.length;
  }

  async update(payload) {
    let count = 0;
    const tableRows = this.state[this.table] || [];
    const ids = new Set(this.rows.map((row) => row.id));
    for (const row of tableRows) {
      if (ids.has(row.id) || (row.id == null && this.rows.includes(row))) {
        Object.assign(row, clone(payload));
        count += 1;
      }
    }
    return count;
  }

  async del() {
    const tableRows = this.state[this.table] || [];
    const ids = new Set(this.rows.map((row) => row.id));
    const before = tableRows.length;
    this.state[this.table] = tableRows.filter((row) => !ids.has(row.id));
    return before - this.state[this.table].length;
  }

  then(resolve, reject) {
    return Promise.resolve(this.materialize()).then(resolve, reject);
  }
}

export function createFakeDb(seed = {}) {
  const state = clone(seed);
  const db = (table) => new Query(state, table);
  db.raw = async () => [{ 1: 1 }];
  db.transaction = async (callback) => callback(db);
  db.__state = state;
  return db;
}
