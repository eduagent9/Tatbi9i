# Data layer

- The legacy browser data key `tatbiqi.database.v1` is read-only input for a future, explicitly approved import. No code in this foundation writes to or deletes it.
- New persistence is SQLite through `@capacitor-community/sqlite` and is enabled only in the native Capacitor app.
- The web preview intentionally reports that persistent SQLite is unavailable; it does not silently fall back to localStorage or pretend data is saved.
- `sqlite-database.ts` owns the native connection and sequential, transactional schema migration runner.
- Migration versions are append-only. Never edit a migration that may already have shipped; add the next numbered migration instead.
- The first schema is still a foundation draft. Runtime validation on a real Android device, backup/restore, and the SQLCipher/plugin licensing review remain release gates.
- Legacy dry-run and validation modules are read-only. No import is started automatically.
