# Changelog

## v0.1.0-alpha.2

### Added

- Carrier management page
- Carrier create, edit, delete and search workflows
- Authenticated carrier CRUD API
- SQLite carrier persistence with automatic table/index initialization
- Country/region code, website and notes fields for carrier profiles

### Changed

- Enabled the Carriers navigation entry
- Added active navigation highlighting
- Dashboard now reports carrier-management progress
- Prepared carrier data as the source for the upcoming SIM number workflow

## v0.1.0-alpha.1

### Added

- Initial SIMKeeper project skeleton
- First-run administrator setup
- Login/logout and persistent sessions
- SQLite + Drizzle storage layer
- Dashboard shell
- Health check endpoint
- Docker runtime
- GitHub Actions Docker build workflow
- Automatic GHCR publishing for `main` and version tags
- Multi-architecture images for `linux/amd64` and `linux/arm64`
- Production `compose.yml` using GHCR image
- Development `compose.build.yml` for local builds
