# Phase 1 technical stack decisions

Date: 2026-11-20  
Target platform: Android first  
Current Capacitor baseline: 7.4.3

## Decisions

| Area | Decision | Reason |
|---|---|---|
| UI | React 18 + TypeScript | Component boundaries, typed business flows, maintainable multi-role screens |
| Build | Vite | Small, direct web build integrated with Capacitor |
| Native shell | Keep Capacitor 7.4.3 initially | Avoid an unnecessary Capacitor major-version migration during the data-model redesign |
| Local database | SQLite | Transactions, constraints, indexed queries, and reliable offline records |
| SQLite bridge candidate | `@capacitor-community/sqlite@7.0.3` | Its package metadata declares peer compatibility with `@capacitor/core >=7.0.0`; it matches the existing Capacitor 7 line |
| Server sync | Deferred | No Supabase or other backend provider is selected in this phase |

## SQLite plugin verification

The selected candidate is `@capacitor-community/sqlite@7.0.3`, not the current 8.x release, because the existing app uses Capacitor 7.4.3. The 7.0.3 package metadata declares a peer dependency of `@capacitor/core >=7.0.0`.

References:
- Plugin release v7.0.3: https://github.com/capacitor-community/sqlite/releases/tag/v7.0.3
- v7.0.3 package metadata: https://github.com/capacitor-community/sqlite/blob/v7.0.3/package.json
- Plugin README: https://github.com/capacitor-community/sqlite/tree/v7.0.3

Important: this plugin uses SQLCipher even for unencrypted databases. SQLCipher can trigger encryption export/self-classification obligations for software distribution. Before shipping an APK that includes this plugin, review the applicable distribution requirements and confirm the plugin's Android build and runtime behavior on the target device. This technical compatibility check is not legal advice.

## Web preview and offline behavior

The app must remain installable as Android APK. A browser preview may be used for UI review, but native SQLite behavior must be tested in the Android app. The plugin's web implementation has separate setup requirements and must not be assumed to behave identically to Android.

## Security boundary

- Local database encryption, key management, and backup protection must be designed explicitly; adding a SQLite plugin alone does not make the app secure.
- PINs are not passwords. New user authentication must use a proper credential/session design when the central service is introduced.
- GPS collection must be transparent, permission-based, and restricted to configured working periods.
- Never store secrets or backend credentials in the web bundle.

## Not yet decided

- Central API/backend provider and hosting.
- Authentication provider and account recovery.
- Exact GPS sampling policy and retention period.
- Backup encryption and recovery-key handling.
- Whether browser preview uses SQLite WASM or a clearly separated development adapter.
