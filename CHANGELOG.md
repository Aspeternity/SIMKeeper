# Changelog

## v0.1.0-alpha.3

### Added

- SIM / eSIM number management page
- Authenticated SIM CRUD API
- SQLite-backed SIM lifecycle records with automatic table/index initialization
- Carrier association with inherited country/region information
- SIM type options for physical SIM, eSIM and eSIM adapter cards
- Phone number / MSISDN, ICCID, balance, currency, status, activation date, validity date and notes
- Built-in currency catalog with automatic defaults based on carrier country/region
- Number search and filtering by status and carrier
- Lifecycle summary cards for total, active, due-soon and overdue numbers
- Dashboard action list for expired and 30-day upcoming validity dates

### Changed

- Enabled the Number Management navigation entry
- Sidebar version updated to `v0.1.0-alpha.3`
- Dashboard statistics now use real SQLite SIM data instead of placeholders
- Carrier deletion is blocked while the carrier is still referenced by a SIM record
- Country/region remains normalized through the carrier relationship instead of being duplicated in each SIM record

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
