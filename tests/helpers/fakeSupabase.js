/* Імітація клієнта Supabase для тестів: спільна «база» для кількох клієнтів,
   кожен бачить лише рядки свого user_id (як правило RLS на сервері). */
export function createFakeDb() {
  const rows = new Map(); // key user|collection|id → row
  let offline = false;
  const db = {
    rows, setOffline(v) { offline = v; },
    clientFor(userId) {
      return {
        from(table) {
          if (table !== 'records') throw new Error('unknown table ' + table);
          const q = { filters: [], from: 0, to: Infinity };
          const builder = {
            select() { return builder; },
            eq(col, val) { q.filters.push([col, val]); return builder; },
            order() { return builder; },
            range(a, b) { q.from = a; q.to = b; return builder; },
            then(res, rej) {
              if (offline) return Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }).then(res, rej);
              const all = [...rows.values()].filter(r => r.user_id === userId && q.filters.every(([c, v]) => r[c] === v))
                .sort((a, b) => (a.collection + a.id < b.collection + b.id ? -1 : 1));
              return Promise.resolve({ data: all.slice(q.from, q.to + 1).map(r => JSON.parse(JSON.stringify(r))), error: null }).then(res, rej);
            },
          };
          return {
            select: builder.select,
            async upsert(list) {
              if (offline) return { error: { message: 'Failed to fetch' } };
              for (const r of list) {
                if (r.user_id !== userId) return { error: { message: 'new row violates row-level security policy' } };
                rows.set([r.user_id, r.collection, r.id].join('|'), JSON.parse(JSON.stringify(r)));
              }
              return { error: null };
            },
          };
        },
      };
    },
  };
  return db;
}
export function memCache() { let v = null; return { read: () => (v ? JSON.parse(v) : null), write: o => { v = JSON.stringify(o); } }; }
