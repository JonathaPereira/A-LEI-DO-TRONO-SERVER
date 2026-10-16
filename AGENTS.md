# Working in this repository

When interacting with Cloudflare, use the cf CLI unless the project has a Wrangler configuration file.

Read `docs/ARQUITETURA.md` for module ownership and `docs/MIGRACAO.md` for migration state.

- Work on a contribution branch. Keep main unchanged and publish only on an explicit user request.
- Preserve existing games, media, profiles, clips and soundboard features during migration.
- Edit source in `src/`, `server/` and `electron/`. Root JS/CSS under `public/`, `out/` and `.next/` are generated.
- Transfer state and listeners together when replacing a legacy controller. Keep one socket and one owner of each media resource.
- Run typecheck, format check, static build and relevant behavior regressions. Interface tests consume `out/`; media changes also require real Electron checks.
- Record completed conversions and remaining work in `docs/MIGRACAO.md` for human continuity without chat history.
