# Changelog

## v0.1.0-alpha.3

### Added

- SIM / eSIM number management page
- Authenticated SIM CRUD API
- SQLite-backed SIM lifecycle records with automatic table/index initialization
- Carrier association with inherited country/region information
- SIM type options for physical SIM and eSIM
- Phone number / MSISDN, ICCID, balance, currency, status, activation date, validity date and notes
- Built-in currency catalog with automatic defaults based on carrier country/region
- Number search and filtering by status and carrier
- Lifecycle summary cards for total, active, due-soon and overdue numbers
- Dashboard action list for expired and 30-day upcoming validity dates
- Automatic international calling-code prefix based on the selected carrier country/region
- E.164 phone-number parsing and normalization using country-aware numbering metadata
- Per-SIM tariff profiles stored independently from core SIM records
- Tariff editor covering local calls, local SMS, data, international calls/SMS and roaming calls/SMS/data
- Structured local and roaming incoming-SMS status for free, charged, unavailable or unknown
- Structured roaming availability status for quick usage decisions
- Tariff source URL, last verification date, usage conclusion and detailed notes
- Tariff summaries directly on the number list, including incoming-SMS and roaming status
- Normalized tariff-rate rows with status, numeric amount and service-specific billing units
- Shared tariff currency selector with automatic SIM/country currency defaults
- Standard billing-unit catalogs for calls, SMS and data usage
- Compatibility display for legacy freeform tariff text until it is reconfirmed in structured form
- Structured plan overview fields for prepaid/postpaid type, recurring fee, billing period, administration fee and auto-renew status
- One-time SIM/eSIM purchase cost stored separately from recurring fees
- Structured included allowances for voice minutes, SMS units and data volume
- Dedicated unlimited-in-plan tariff state for unlimited voice/data entitlements
- Plan fee/type/renewal summaries directly on the number list
- Multiple conditional tariff rules per service while preserving a simple default rate
- Structured conditions for same/other network, destination, roaming region and time windows
- Multi-condition rules where repeated condition types are alternatives and different types are combined
- Package/pass tariff rules with price, included allowance, validity period and renewal behavior
- Country/region selectors for destination and roaming rules, including home/current/other destination shortcuts
- Conditional incoming-SMS summaries that surface as `按条件` on the number list
- Optional custom tariff items for carrier-specific fees not covered by the common template
- Shared viewport-level modal portal for consistent full-screen overlays and background scroll locking
- Read-only number overview opened from a number-list row, showing core SIM details and the current local/roaming tariff profile with direct edit shortcuts

### Changed

- Enabled the Number Management navigation entry
- Sidebar version updated to `v0.1.0-alpha.3`
- Dashboard statistics now use real SQLite SIM data instead of placeholders
- Carrier deletion is blocked while the carrier is still referenced by a SIM record
- Country/region remains normalized through the carrier relationship instead of being duplicated in each SIM record
- Number entry now selects the carrier before the phone number so the correct international prefix is shown automatically
- Phone-number input accepts a local number while storage remains normalized to the full international number
- Simplified SIM type semantics to physical SIM or eSIM only; eSIM adapters such as eSTK/5ber are treated as hardware carriers rather than a separate SIM type
- Existing `esim_adapter` records are automatically migrated to `esim`
- Split number editing and tariff editing into separate modules so lifecycle features can evolve independently
- Deleting a SIM now cascades to its tariff profile while preserving carrier deletion protection
- Replaced freeform per-service tariff descriptions with standardized status/amount/unit controls
- Tariff amount fields are enabled only for charged items; free, unavailable and unknown states require no manual amount entry
- Included tariff items now use numeric allowance plus service-specific allowance units, while unlimited-in-plan requires no numeric input
- Incoming-SMS summary statuses are now derived automatically from the corresponding structured tariff rows
- Backend validation now restricts billing and allowance units by service type so calls, SMS and data cannot store incompatible units
- Existing databases are upgraded in place with tariff-plan metadata columns without rebuilding SIM or tariff records
- Complex carrier tariffs such as network-specific SMS rates, roaming destination tiers and regional data passes no longer need to be flattened into notes
- Conditional tariff storage is additive, so existing default-rate records continue working without migration or data loss
- Tariff editor common items now cover all five local services and all five roaming services: outgoing/incoming calls, outgoing/incoming SMS and mobile data
- International call and international SMS remain opt-in extension items instead of being permanently expanded
- Advanced conditional rules and optional passes are hidden behind per-service `特殊规则` controls
- Monetary values and billing units now appear after the numeric input rather than before it
- Tariff modal is rendered through a document-body portal with background scroll locking to remove the top-edge gap and keep header/footer stable
- SIM create/edit and carrier create/edit dialogs now use the same document-body portal so all existing overlays cover the complete viewport without a top white gap
- Number Management no longer duplicates Dashboard overview cards; it is now focused on the searchable/filterable number list and per-number actions
- Local and roaming verification-code summary lines now use the same font size, weight and spacing in the number list

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
