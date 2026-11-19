# LaunchForge — Security Model

## Data Protection
- All data stored locally in SQLite database
- No external network calls
- No cloud services
- No public DNS modification

## Archive Security
- Maximum archive size limit (50MB default)
- Maximum extracted size limit (200MB default)
- Maximum file count limit (5000 default)
- Path traversal prevention in all archive entries
- Null byte injection prevention

## Build Security
- Build execution requires explicit user action
- Builds run with limited privileges
- Timeout enforcement
- Output directory validation before copy
- Previous successful deployments preserved on failure

## Environment Variables
- Values never exposed in API responses (masked for secrets)
- Values never included in frontend bundles
- Values never written to application logs
- Only injected into build process via explicit mechanism

## Preview Server
- Binds to 127.0.0.1 only
- Serves files only from deployment directory
- Path traversal prevention
- No environment variable or config exposure via preview routes