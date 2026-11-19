# LaunchForge — Test Plan

## Unit Tests
- Archive service: valid/invalid ZIP handling
- Security: path traversal prevention
- Build service: command execution and log capture
- Preview service: file resolution and MIME types
- EnvVar service: validation and masking

## Integration Tests
- Project creation via API
- Project persistence across restart
- Deployment lifecycle (queued → building → ready/failed)
- Preview serving
- Environment variable CRUD
- Domain alias management

## Acceptance Criteria
- Application starts locally on 127.0.0.1:3001
- No syntax or type errors
- All navigation links lead to real pages
- Project creation persists data
- Valid ZIP archives import successfully
- Malformed and traversal archives rejected
- Successful builds produce Ready deployments
- Failed builds produce Failed deployments with logs
- Preview URL opens generated website
- Path traversal prevented in preview
- Environment variable secrets masked
- No public deployment configuration present