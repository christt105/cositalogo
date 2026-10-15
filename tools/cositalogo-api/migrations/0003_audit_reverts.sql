ALTER TABLE audit ADD COLUMN reverts INTEGER;

CREATE INDEX audit_by_reverts ON audit (reverts) WHERE reverts IS NOT NULL;
CREATE INDEX audit_by_target ON audit (target);
