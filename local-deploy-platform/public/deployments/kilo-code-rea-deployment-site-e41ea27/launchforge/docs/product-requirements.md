# LaunchForge — Product Requirements

## Overview
LaunchForge is an original, locally running web deployment platform inspired by the publicly observable behavior of modern deployment platforms like Vercel.

## Core Features
1. Project management (create, list, search, edit, delete)
2. Archive import with secure extraction and framework detection
3. Real build execution with log capture and timeout handling
4. Local preview server on 127.0.0.1
5. Environment variable records with secret masking
6. Domain alias records (local only, no public DNS)
7. Analytics from actual stored data
8. Original starter templates
9. Local application settings

## Technical Stack
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Node.js + TypeScript + Express
- Database: SQLite (better-sqlite3)
- Validation: Zod
- Styling: Tailwind CSS with custom dark theme

## Security Requirements
- All data stored locally
- No public deployment or tunnel configuration
- Path traversal prevention in archive extraction
- Archive size and file count limits
- Build execution opt-in with explicit user action
- Environment variable values never exposed in logs or frontend bundles
- Preview server binds to 127.0.0.1 only