-- Local owner profile used by the first offline-only build. This is a profile seed, not authentication.
INSERT OR IGNORE INTO users (id,display_name,phone,role,is_active,created_at,updated_at)
VALUES ('local-owner','المسؤول',NULL,'owner',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
