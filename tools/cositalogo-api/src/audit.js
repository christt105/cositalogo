const asJson = (value) => (value === undefined ? null : JSON.stringify(value));

/** The statement that records one write in the `audit` table, to run in the same batch as the write itself. */
export function audit(db, user, action, target, before, after, now) {
  return db.prepare("INSERT INTO audit (at, user_id, action, target, before, after) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(now, user.id, action, target, asJson(before), asJson(after));
}
