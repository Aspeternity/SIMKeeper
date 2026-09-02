# Changelog

## v0.1.0-alpha.2

### Added

- Carrier management page
- Carrier create, edit, delete and search workflows
- Authenticated carrier CRUD API
- SQLite carrier persistence with automatic table/index initialization
- Country/region code, website and notes fields for carrier profiles
- Built-in standardized country/region catalog using ISO two-letter codes
- Reusable searchable country/region selector with name and ISO-code filtering
- Built-in common carrier catalog with official website presets for frequently used countries and regions
- One-click carrier preset selection after choosing a country or region
- Expanded common carrier presets across Europe, the Middle East, Latin America, Africa and Southeast Asia
- Added popular UK virtual/sub-brands including giffgaff, VOXI and SMARTY

### Changed

- Enabled the Carriers navigation entry
- Added active navigation highlighting
- Dashboard now reports carrier-management progress
- Prepared carrier data as the source for the upcoming SIM number workflow
- Replaced freeform country/region and country-code inputs with a controlled selector
- Country/region names are now derived server-side from the selected standardized code
- Country/region selection now supports both dropdown browsing and instant search
- Carrier creation now prioritizes country/region selection before carrier details and keeps manual entry as a fallback
- Carrier presets follow current commercial brands even when the underlying telecom company has merged or changed legal entity

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
