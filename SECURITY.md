# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in FairProcess, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security concerns to the repository maintainers directly
3. Include a description of the vulnerability, steps to reproduce, and potential impact

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Security Measures

- **Authentication**: PBKDF2 password hashing (100,000 iterations, SHA-256)
- **Session management**: Secure, HttpOnly, SameSite=Strict cookies with 7-day TTL
- **Authorization**: Role-based access control (RBAC) with org-scoped data isolation
- **Bootstrap**: Self-disabling admin bootstrap with environment token protection
- **Evidence**: Immutable evidence vault with R2 object storage
- **Secrets**: All secrets managed via Cloudflare environment variables — never hardcoded

## Scope

This policy covers the production codebase in `frontend/web/`. The `backend/` directory
contains frozen Python reference code that is not deployed and is out of scope.
