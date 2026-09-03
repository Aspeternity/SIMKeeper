# Changelog

## v0.1.0-alpha.8.3

### Added

- User-controlled `错过计划时间后补发` switch for the exact daily notification scheduler
- Global customizable notification title, digest-body and per-reminder templates shared by Telegram, Bark, Gotify and Webhook
- Template variables for app name, heading, reminder count, date, channel name, SIM label, phone number, carrier, country/region, reminder source, status, relative time, due date and detailed reminder text
- Live template preview using sample lifecycle data before saving
- One-click restore of the default notification templates
- Channel test notifications now render a sample reminder through the currently saved templates so the final notification appearance can be verified directly
- Post-publish notification smoke coverage for disabled catch-up behavior, template persistence, real rendered Webhook payloads, digest aggregation, secret masking and backup coverage

### Changed

- Catch-up remains enabled by default for existing installations, but can now be disabled independently from the notification master switch
- When catch-up is disabled and SIMKeeper starts after the daily notification time, that day's automatic run is skipped and the scheduler waits for the next planned day
- Notification schedule and template settings are persisted in the existing `settings` table and therefore automatically included in complete backups and restores
- Sidebar and package version updated to `v0.1.0-alpha.8.3`

## v0.1.0-alpha.8.2

### Added

- Exact `HH:MM` daily notification scheduling in `Asia/Shanghai` instead of a start-hour window
- Configurable lifecycle notification milestones with defaults at 30, 14, 7, 3, 1 and 0 days before the due date
- Overdue reminder cadence at day 1, day 3, day 7 and then every 7 days; unscheduled lifecycle items repeat every 7 days
- Per-channel filters for reminder source and lifecycle status
- One digest per enabled channel containing all reminders due for that run instead of one message per reminder
- Server-side notification-secret masking for Telegram Bot Token, Bark Device Key, Gotify Application Token and Webhook Bearer Token
- Secret-preserving channel edits where an empty credential field keeps the existing server-side value

### Changed

- Removed the 15-minute polling model; the runtime now arms a timer for the next exact daily notification time
- A container that starts after the configured time catches up once for that day, then schedules the next daily run
- Manual `立即发送当前提醒` ignores milestone timing but continues to respect each channel's reminder filters and digest formatting
- Automatic notification delivery records remain per underlying reminder so history and deduplication stay traceable even when several reminders are delivered in one digest

## v0.1.0-alpha.8.1

### Fixed

- Keep-alive rules can now explicitly choose whether their next date follows the SIM validity date or uses an independent lifecycle date
- `跟随号码有效期` rules now derive their effective next-action date directly from Number Management `有效期至`, removing contradictory dates between Number Management and Keep-alive Management
- Existing validity-style rules named `号码有效期`, `SIM有效期`, `SIM 卡有效期`, `储值卡有效期` or `有效期` are migrated once to the linked validity source when the new column is introduced
- Validity-linked rules no longer store a second independent `next_due_date`; editing the SIM validity is immediately reflected by Keep-alive Management and Number Details
- Reminder Center merges a validity-linked keep-alive rule into the single SIM-validity reminder instead of producing duplicate lifecycle alerts
- Linked validity rules reuse their own warning-window and grace-period settings for the unified SIM-validity reminder
- Dashboard and Telegram/Bark/Gotify/Webhook delivery now reuse the same reminder calculation and therefore the same lifecycle date source
- Recording a recharge or renewal no longer guesses a new SIM expiry from a linked rule interval; the operator-confirmed `活动后有效期` or later Number Management edit remains authoritative
- Independent activity rules such as 90-day usage requirements continue to maintain and advance their own next-action dates
- Added a post-publish lifecycle-consistency smoke workflow that edits a SIM validity date, verifies immediate keep-alive synchronization, due-soon state, and absence of duplicate reminders against the published Docker image

### Changed

- Sidebar and package version updated to `v0.1.0-alpha.8.1`
- Keep-alive rule editor now exposes `跟随号码有效期` and `独立日期` as explicit date-source choices
- Keep-alive list and Number Details display the selected date source beside each rule

## v0.1.0-alpha.8

### Added

- Dedicated notification-channel management page for turning reminder-center items into proactive alerts
- Notification providers for generic Webhook, Bark, Gotify and Telegram Bot
- Per-channel enable/disable state, provider-specific configuration and one-click test notifications
- Container-internal notification scheduler started with the Next.js runtime, requiring no extra cron container
- Automatic reminder checks every 15 minutes with a configurable daily start hour in `Asia/Shanghai`
- Catch-up behavior when the container starts after the configured daily notification time
- Same-day automatic deduplication per channel, reminder key, reminder status and due date
- Manual `立即发送当前提醒` action that intentionally bypasses daily deduplication
- Notification delivery history for both test and reminder sends, including success/failure state and error details
- Loopback-compatible GET Webhook mode in addition to standard POST JSON Webhooks
- Optional Bearer authentication for Webhook notifications
- Custom Bark server URL, device key and notification group
- Custom Gotify server URL, application token and priority
- Custom Telegram API base URL, bot token and chat ID
- Notification channels and delivery history included in portable/local backups and restores
- Post-publish notification smoke workflow that validates a real loopback Webhook test, due-reminder delivery, same-day deduplication and backup coverage against the newly published Docker image

### Changed

- Sidebar and package version updated to `v0.1.0-alpha.8`
- Added `通知渠道` directly after `提醒中心` in the primary navigation
- Automatic notifications are disabled by default after upgrade and must be explicitly enabled after at least one channel is configured and tested
- Notification credentials are treated as sensitive configuration and are explicitly called out as part of complete backups

## v0.1.0-alpha.7

### Added

- Settings and Backup page for protecting and migrating all long-lived SIMKeeper data
- Portable JSON backup format covering administrator accounts, settings, carriers, SIM records, real-name/KYC data, tariffs, conditional tariff rules, custom tariff items, keep-alive rules/events and bound services
- One-click local backup creation inside the persistent data directory
- Downloadable portable JSON exports for moving data between SIMKeeper instances
- Local backup listing with creation time, app version, reason, file size and high-level record counts
- Full restore from either a local backup or an imported JSON backup
- Automatic pre-restore safety backup before every destructive restore operation
- Transactional restore with child-first deletion, parent-first insertion and SQLite foreign-key integrity validation before commit
- Forward/backward-friendly logical restore that ignores unknown future columns and lets missing older columns use current database defaults
- Configurable local backup retention with automatic pruning
- Explicit sensitive-data warning because backups include real-name details, account identifiers and password hashes
- CI disaster-recovery smoke test covering export, local backup creation, deliberate data mutation, full import restore and post-restore verification

### Changed

- Enabled `设置与备份` in the sidebar
- Sidebar and package version updated to `v0.1.0-alpha.7`
- Backup retention is persisted in the existing settings table instead of introducing a separate configuration store
- Restore operations preserve the current running database connection and recover logical data rather than replacing the live SQLite/WAL files in place

## v0.1.0-alpha.6

### Added

- Dedicated bound-services management page for recording which accounts and businesses depend on each phone number
- Per-binding service name, category, phone-number usage, account identifier, importance, status, website, binding date, last verification date and notes
- Common service categories for communication/social, finance/payment, shopping, cloud/accounts, entertainment, work, government/public services, security/identity and custom cases
- Binding roles for login, verification codes, 2FA, recovery, contact number and other uses
- Importance levels for critical, high, normal and low-priority bindings
- Binding lifecycle states for current, migrated and unbound relationships so historical dependencies can be retained instead of deleted
- Search and filters by binding status, category, importance, service name, account identifier, SIM and carrier
- Dedicated SIM selector on the bound-services page for viewing all bindings associated with one specific number
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
