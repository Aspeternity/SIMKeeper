# Changelog

## v0.1.0-alpha.6

### Added

- Dedicated bound-services management page for recording which accounts and businesses depend on each phone number
- Per-binding service name, category, phone-number usage, account identifier, importance, status, website, binding date, last verification date and notes
- Common service categories for communication/social, finance/payment, shopping, cloud/accounts, entertainment, work, government/public services, security/identity and custom cases
- Binding roles for login, verification codes, 2FA, recovery, contact number and other uses
- Importance levels for critical, high, normal and low-priority bindings
- Binding lifecycle states for current, migrated and unbound relationships so historical dependencies can be retained instead of deleted
- Search and filters by binding status, category, importance, service name, account identifier, SIM and carrier
- Bound-services section in number details with current/critical counts, collapsible service cards and click-to-copy account identifiers
- Direct links to service websites and the central bound-services manager
- Dashboard shortcut and progress count for recorded bound services
- CI smoke coverage for creating, retrieving and rendering a critical finance/2FA binding

### Changed

- Enabled the `绑定服务` sidebar entry
- Sidebar and package version updated to `v0.1.0-alpha.6`
- Number details now follow `基本信息 → 实名信息 → 绑定服务 → 保号状态 → 资费概览`, with all sections collapsed by default
- Bound-service records deliberately exclude password, one-time code and recovery-secret fields; SIMKeeper stores relationship metadata rather than acting as a password manager

## v0.1.0-alpha.5

### Added

- Dedicated reminder center for lifecycle tasks generated from SIM validity dates and keep-alive rules
- Shared reminder calculation engine with reminder kinds for SIM validity and keep-alive requirements
- Reminder states for overdue, grace period, today, upcoming and missing next-action dates
- Automatic 30-day reminder window for SIM validity dates
- Per-rule reminder windows and grace periods reused directly from keep-alive configuration
- Reminder search by number, name, carrier or reminder title
- Reminder filters by lifecycle status and reminder source
- Reminder summary cards for current reminders, overdue/grace items, today and upcoming items
- Dashboard shortcut and full-list link to the reminder center
- CI smoke coverage confirming an in-window keep-alive rule is rendered by the reminder center

### Changed

- Sidebar and package version updated to `v0.1.0-alpha.5`
- Dashboard remains a concise priority summary while the reminder center owns the complete searchable/filterable reminder list
- Dashboard action links now route through the reminder center before going to the underlying number or keep-alive management area
- All number-detail sections now start collapsed by default, including Basic Information, Real-name Information, Keep-alive Status and Tariff Overview

## v0.1.0-alpha.4

### Added

- Keep-alive management page with per-number lifecycle rules
- Multiple independent keep-alive rules per SIM so recharge validity and activity requirements can be tracked at the same time
- Rule intervals in days, months or years with end-of-month-safe date calculations
- Qualifying activity types for recharge, outgoing calls, outgoing SMS, data use, plan renewal, other chargeable activity and manual extensions
- Configurable next-action date, warning window and grace period per keep-alive rule
- Keep-alive activity history with optional cost, resulting balance, resulting SIM validity date and notes
- Automatic keep-alive rule advancement when a recorded activity matches that rule's qualifying actions
- Automatic SIM balance and validity synchronization from keep-alive activity records
- Searchable/filterable keep-alive management view with per-SIM status and earliest upcoming action
- Keep-alive status section inside number details with current rules and recent activity history
- Dashboard lifecycle alerts combining SIM validity dates and keep-alive rule due dates
- CI smoke coverage for multiple independent rules, selective automatic advancement and SIM state synchronization

### Changed

- Enabled the `保号管理` sidebar entry
- Sidebar and package version updated to `v0.1.0-alpha.4`
- Dashboard `30 天内需处理` concept replaced by generalized `待处理`, using both SIM validity dates and per-rule warning windows
- Dashboard active/overdue lifecycle state now considers enabled keep-alive rules in addition to SIM validity
- Number details now follow the lifecycle order `基本信息 → 实名信息 → 保号状态 → 资费概览`

## v0.1.0-alpha.3

### Added

- SIM / eSIM number management page
- Authenticated SIM CRUD API
- SQLite-backed SIM lifecycle records with automatic table/index initialization
- Carrier association with inherited country/region information
- SIM type options for physical SIM and eSIM
- Phone number / MSISDN, ICCID, balance, currency, status, activation date, validity date and notes
- Optional per-number real-name / KYC profile with registration status, holder name, document type, document number, document country/region and notes
- Custom real-name document/material type when `其他证件 / 材料` is selected, supporting entries such as travel permits, utility bills and address proof
- Real-name information section in number details with collapse controls and click-to-copy values
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
- Full conditional tariff-rule rendering inside the number overview, including rule labels, conditions, pricing and package/pass details
- Click-to-copy behavior for number details, tariff fields, rate values, special rules, notes and source URLs with brief copy-success feedback
- Collapsible Basic Information and Tariff Overview sections in the number detail dialog
- Optional backdrop-click closing for dialogs

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
- Existing databases are upgraded in place with tariff-plan metadata and real-name/KYC columns without rebuilding SIM or tariff records
- `其他证件 / 材料` now requires a custom descriptive type and clears that custom value automatically when another standard document type is chosen
- Complex carrier tariffs such as network-specific SMS rates, roaming destination tiers and regional data passes no longer need to be flattened into notes
- Conditional tariff storage is additive, so existing default-rate records continue working without migration or data loss
- Tariff editor common items now cover all five local services and all five roaming services: outgoing/incoming calls, outgoing/incoming SMS and mobile data
- International call and international SMS remain opt-in extension items instead of being permanently expanded
- Advanced conditional rules and optional passes are hidden behind per-service `特殊规则` controls
- Conditional services with no meaningful fallback price now render as `按条件计费` instead of showing contradictory `未知` or zero-value base rates
- Monetary values and billing units now appear after the numeric input rather than before it
- Tariff modal is rendered through a document-body portal with background scroll locking to remove the top-edge gap and keep header/footer stable
- SIM create/edit and carrier create/edit dialogs now use the same document-body portal so all existing overlays cover the complete viewport without a top white gap
- Number, carrier and tariff edit dialogs can be dismissed by clicking the backdrop when no save is in progress
- Number Management no longer duplicates Dashboard overview cards; it is now focused on the searchable/filterable number list and per-number actions
- Local and roaming verification-code summary lines now use the same font size, weight and spacing in the number list
- Number and tariff edit actions now live beside their corresponding overview section headers instead of being split between the section header and modal footer

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
