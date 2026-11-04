# VG Deployment App — Feature Specification

**Product:** VG Deployment App (working name)
**Version:** 1.0.0 (initial)
**Scope:** Local-only developer deployment platform
**Reference:** Publicly observable Vercel features (vercel.com/docs)
**Restriction:** Local-only. Binds to 127.0.0.1. No public deployment or exposure.

---

## Feature 1: Project Management

### User Goal
Create, view, list, and manage projects that group deployments, domains, environment variables, and build settings.

### Observable Behavior (from Vercel public docs)
- Projects are created via dashboard ("Create New > Project") or API
- Projects can be imported from Git repository or created from templates
- Each project has: name, framework, root directory, build command, output directory, environment variables
- Projects group deployments and settings together

### Inputs/Outputs
- Input: project name, optional description
- Output: project record with unique ID, creation timestamp, default settings

### UI States
- Empty state: "No projects yet. Create your first project."
- Loading state: spinner during project creation
- Error state: validation errors (empty name, duplicate name, invalid characters)

### Accessibility
- Form labels associated with inputs
- Keyboard navigable form
- ARIA live regions for status announcements

### Security
- Validate project name (no path traversal characters, reasonable length)
- Sanitize input before storage
- Authorization check on all project operations

### Evidence
- Vercel docs: "Creating a project" (vercel.com/docs/projects/managing-projects)
- Vercel docs: "Projects overview" (vercel.com/docs/projects)

---

## Feature 2: ZIP Upload and Static Website Deployment

### User Goal
Upload a ZIP archive containing a static website and deploy it locally.

### Observable Behavior (from Vercel public docs)
- Vercel Drop accepts .zip, folder, or file drag-and-drop
- Static sites deploy without build step; framework projects are detected and built
- Each file up to 100 MB, whole drop up to 1 GB
- Deployment generates a unique URL
- Static files served as-is; no build required for HTML/CSS/JS

### Inputs/Outputs
- Input: ZIP file upload, project selection (or new project)
- Output: deployment record, deployment URL (http://127.0.0.1:PORT/...)

### UI States
- Upload state: drag-and-drop zone or file picker
- Validation state: checking archive integrity and safety
- Building state: extraction and artifact creation
- Success state: deployment URL displayed
- Error state: invalid archive, path traversal detected, size exceeded

### Accessibility
- Drop zone keyboard accessible
- File input with proper labeling
- Progress announcements via ARIA

### Security (Critical)
- ZIP path traversal prevention: reject entries with `..` or absolute paths
- Archive size limits
- Safe extraction to controlled workspace directory
- No execution of uploaded content
- Validate ZIP integrity before extraction

### Evidence
- Vercel Drop docs (vercel.com/docs/drop)
- Vercel CLI deploy docs (vercel.com/docs/cli/deploy)

---

## Feature 3: Deployment History and Status

### User Goal
View all deployments for a project with their status, duration, and logs.

### Observable Behavior (from Vercel public docs)
- Deployments listed chronologically with status (building, ready, error, canceled)
- Each deployment has unique URL, build time, detected framework
- Project overview shows latest production deployment
- Deployment details page shows summary and resources

### Inputs/Outputs
- Input: project ID filter, status filter
- Output: deployment list with status, timestamps, duration, URL

### UI States
- Empty state: "No deployments yet"
- Loading state: spinner
- Status indicators: building (spinner), ready (green), error (red), canceled (gray)

### Accessibility
- Status conveyed by text (not color alone)
- Table with proper headers and row associations

### Evidence
- Vercel docs: "Deploying to Vercel" (vercel.com/docs/deployments)
- Vercel docs: "Project Overview" section

---

## Feature 4: Build Logs

### User Goal
View build logs for a deployment to debug failures or monitor progress.

### Observable Behavior (from Vercel public docs)
- Build logs show deployment progress, warnings, errors
- Logs stored indefinitely per deployment
- Errors highlighted in red, warnings in yellow
- Logs can be linked to specific lines
- Logs truncated at 4MB

### Inputs/Outputs
- Input: deployment ID
- Output: log entries with timestamp, level, message

### UI States
- Empty state: "No logs available"
- Loading state: spinner
- Error state: log retrieval failed

### Accessibility
- Log levels indicated by text and color
- Monospace font for readability

### Evidence
- Vercel docs: "Accessing Build Logs" (vercel.com/docs/deployments/logs)

---

## Feature 5: Deployment Rollback

### User Goal
Restore a previous successful deployment to recover from a bad release.

### Observable Behavior (from Vercel public docs)
- Instant Rollback: point production at a previous deployment without rebuild
- Hobby: roll back to previous deployment only
- Pro/Enterprise: roll back to any eligible deployment
- Rollback is at routing level, takes effect within seconds
- Undo rollback by promoting a different deployment

### Inputs/Outputs
- Input: deployment ID to roll back to
- Output: confirmation, updated production deployment reference

### UI States
- Confirmation dialog before rollback
- Success state: rollback complete
- Error state: rollback failed (no eligible deployment, etc.)

### Accessibility
- Confirmation dialog with clear primary/secondary actions
- ARIA alert for rollback status

### Evidence
- Vercel docs: "Instant Rollback" (vercel.com/docs/instant-rollback)
- Vercel docs: "Promoting Deployments" (vercel.com/docs/deployments/promoting-a-deployment)

---

## Feature 6: Domain Configuration

### User Goal
Configure custom domains for projects.

### Observable Behavior (from Vercel public docs)
- Custom domains added per project
- DNS verification required
- SSL certificate provisioned after verification
- Domain assigned to environment (production/preview)

### Inputs/Outputs
- Input: domain name, target environment
- Output: domain record with DNS records to configure, verification status

### UI States
- Empty state: "No custom domains"
- Pending state: "DNS verification required"
- Verified state: "Active" with SSL status

### Accessibility
- Form with clear instructions
- DNS record display in code block

### Evidence
- Vercel docs: "Custom domains" (vercel.com/docs/project-configuration/project-settings)
- Vercel docs: "Working with DNS" (vercel.com/docs/domains/working-with-dns)

---

## Feature 7: Environment Variables

### User Goal
Configure environment variables for projects, scoped to environments.

### Observable Behavior (from Vercel public docs)
- Config type: readable after saving
- Secret type: write-only, cannot be retrieved after saving
- Scoped to production, preview, development environments
- Changes require redeploy to take effect
- Secrets redacted from build logs

### Inputs/Outputs
- Input: key, value, type (config/secret), environment scope
- Output: variable stored (secret values not displayed back)

### UI States
- Empty state: "No environment variables"
- Secret indicator: masked value display

### Security
- Secret values never logged or returned in API responses
- .env file excluded from version control
- No real credentials in committed files

### Evidence
- Vercel docs: "Managing environment variables" (vercel.com/docs/environment-variables/managing-environment-variables)
- Vercel docs: "Environment variables" (vercel.com/academy/vercel-foundations/vercel-settings)

---

## Feature 8: Dashboard Navigation

### User Goal
Navigate between platform sections: Overview, Projects, Deployments, Build Logs, Domains, Environment Variables, Analytics, Settings.

### Observable Behavior (from Vercel public docs)
- Sidebar navigation with project selector
- Project-specific navigation within each project
- Global navigation for team/settings

### UI States
- Active state: current section highlighted
- Responsive: collapsible on mobile

### Accessibility
- ARIA landmarks for navigation regions
- Keyboard navigable
- Focus indicators

---

## Uncertainties
- Whether safe build isolation (sandbox/containers) is available on the local machine
- Whether native SQLite support is available in the Node.js version
- Port selection (must not conflict with existing services)

---

## Design Principles (Independent)
- Brand name: VG Deployment App (not Vercel)
- Original color palette, typography, and component design
- Original copy and documentation
- No Vercel logos, trademarks, or protected assets
- All code is original implementation
