# Remaining security audit and fixes

Scope: current Dependabot and code scanning findings against main 202a7397.
The user's current request authorizes fixes beyond the attached review-only prompt.
No release, version change, merge, model download, or installed-runtime change.

1. Refresh all alert evidence and trace complete input-to-sink flows.
2. Independently review Python API findings and JavaScript/Bandit findings;
   add failing regression tests before fixing confirmed vulnerabilities.
3. Update compatible vulnerable dependencies and regenerate canonical locks.
   Prove upstream constraints where an upgrade cannot safely resolve.
4. Preserve engines, API, stored data, and existing compute/platform paths.
   Hardware detection alone does not remediate a dependency vulnerability.
5. Run targeted regressions, backend and frontend checks, dependency resolution,
   and review the complete diff. Record residual risk per alert, without mass
   dismissal or treating unclassified quality warnings as confirmed exploits.
6. Deliver the tested changes and audit evidence for review; do not merge.

Completed evidence: 552 final combined Python tests passed (9 skipped),
127 MCP tests passed (3 skipped), 85 hardware/version contracts passed,
4,580 Electron tests passed (3 skipped), both builds and packaging contract
passed. Fresh independent review found no Critical/Important issues.
Dependency/library residuals and the 510 maintenance findings not individually
cleared are documented in docs/security/2026-10-21-audit.md.
