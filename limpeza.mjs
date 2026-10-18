import {db, atomic, readState} from './banco.mjs';
import {emptyState} from './historico.js';

function fail(status, message) {
  throw Object.assign(new Error(message), {status});
}

function admin(actor) {
  if (actor?.role !== 'admin') fail(403, 'Somente o administrador pode apagar as importações.');
}

export function importedDataOverview(actor) {
  admin(actor);
  const state = readState();
  return {
    revision: state.revision,
    files: db.prepare('SELECT count(*) AS count FROM files').get().count,
    rows: Object.values(state.buckets).reduce((sum, bucket) => sum + bucket.rows.length, 0),
    months: new Set(Object.values(state.buckets).map(bucket => bucket.month)).size,
    history: state.history.length
  };
}

export function clearImportedData(actor, input = {}) {
  admin(actor);
  if (input.confirmation !== 'APAGAR TODOS') fail(400, 'Digite APAGAR TODOS para confirmar.');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail(400, 'Conferência inválida. Atualize a página.');
  return atomic(() => {
    const overview = importedDataOverview(actor);
    if (overview.revision !== input.revision) fail(409, 'Os dados mudaram. Confira novamente antes de apagar.');
    const state = {...emptyState(), revision: overview.revision + 1};
    db.prepare('UPDATE app_state SET revision=?,payload=? WHERE id=1')
      .run(state.revision, JSON.stringify(state));
    db.prepare('DELETE FROM files').run();
    db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(
      crypto.randomUUID(), new Date().toISOString(), actor.id, actor.username,
      'clearImports', JSON.stringify(overview)
    );
    return {state, deleted: overview};
  });
}
