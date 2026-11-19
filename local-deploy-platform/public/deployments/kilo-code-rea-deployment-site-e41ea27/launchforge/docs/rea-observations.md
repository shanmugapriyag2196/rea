# LaunchForge — REA Investigation Notes

## Methodology
Publicly observable product behavior of Vercel-like deployment platforms was studied via the REA (Reverse Engineer Anything) method. Only publicly accessible pages and standard product behavior were inspected. No private dashboards, restricted endpoints, or proprietary source were accessed.

## Observed Workflows

### Dashboard Navigation
- Sidebar with project list, overview, analytics, settings.
- Consistent page hierarchy and responsive layout.
- Working navigation links to real pages.

### Project Creation
- Name input with validation.
- Framework detection from uploaded archive.
- Build command, install command, output directory configuration.
- Template selection.

### Deployments
- Status lifecycle: queued → building → ready/failed.
- Build logs capture stdout/stderr.
- Preview URL generated on localhost.
- Deployment history with timestamps.

### Environment Variables
- Key/value pairs with scope (development, build, runtime).
- Secret values masked in UI.
- Injected into build process explicitly.

### Domains
- Local domain-alias records.
- No public DNS modification.
- localhost preview URLs by default.

## Implementation Requirements for LaunchForge
- Independent original code, no Vercel branding.
- Local-only operation on 127.0.0.1.
- SQLite persistence.
- Real build execution with process isolation.
- Path traversal protection.
- Secure archive extraction with size limits.
- Environment variable masking.