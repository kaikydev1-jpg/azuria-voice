# Critical Python dependencies implementation plan

> Execute inline using the executing-plans workflow. Reuse Dependabot pull request #6.

**Goal:** Remove the reviewed critical Pillow and certifi advisories without changing voice models, application behavior or the app version.

**Architecture:** Raise the project dependency minimums and security constraints, update only the affected lockfile packages, and exercise image handling and TLS using the patched wheels. Keep repository access restrictions active.

**Tech stack:** Python 3.11, uv, pytest, Pillow, certifi, GitHub Actions.

**Spec:** User request in this chat: secure Azúria Voice and address the critical dependency alerts. Advisory references: GHSA-8g5g-8vmr-9782 (Pillow 13.0.0) and GHSA-6q48-6c7w-9gw2 (certifi 2026.10.19).

## Constraints and review focus

- Keep the canonical app version at 0.5.7 until the owner requests a new release.
- Preserve all engines, model licenses, caches, user data and GPU/CPU choices.
- Verify resolver compatibility instead of forcing conflicting dependencies.
- Confirm image analysis still handles generated JPEG/PNG files using Pillow 13.
- Confirm HTTPS certificate verification works with the new certifi bundle.
- Inspect the lockfile for unrelated version changes and retain platform wheels.
- Keep the existing Windows release intact; changing source does not patch its embedded runtime metadata.

## Task 1: Patch, verify and publish the reviewed change

- [x] Raise `PYTHON_FLOORS` in `tests/test_dependency_security_floors.py` for Pillow to 13.0.0 and add certifi 2026.10.19. Update `tests/test_video_context.py` to require the secure runtime floor. Run these tests first and confirm the vulnerable lock fails.
- [x] Change `pyproject.toml` to require the patched versions; run `uv lock --upgrade-package pillow --upgrade-package certifi`. If resolution fails, inspect the conflicting requirement before deciding on a compatibility change.
- [x] Install only the patched packages in the development test environment, run the dependency/image tests and the relevant TLS/network tests, and perform an actual HTTPS request with verification enabled.
- [ ] Update the distribution security guide and changelog, inspect all changes, commit and push onto the existing Dependabot PR branch. Read review comments and wait for Security analysis.
- [ ] Integrate only under the repository merge protocol. The inherited `Tests (backend + frontend)` job is limited to the upstream repository; if it cannot run here, obtain a concrete owner exception after presenting the verified PR instead of silently bypassing that requirement.

## Execution ledger

- Baseline: 11 dependency/image tests passed on main before changes. The newly created PR already patches certifi; Pillow is still 12.3.0.
- The native worktree tool returned `Not a git repository` for the enclosing workspace. A manual isolated worktree was created under `.tools/repo-security/worktree` from the existing Dependabot branch.
- Existing unrelated checks: two CLA tests expect the original repository's README and enabled privileged workflow; a contact-address test attempts to read the gallery gitlink as a file on Windows. These predate this patch.

- Owner approved retiring the legacy Gradio demo to enable the Pillow security update. `gradio-client` stays a default dependency for SoniTranslate.
- Verification: 73 targeted dependency/image/network tests passed; 509 backend/cover/sidecar tests passed, 9 skipped; verified HTTPS returned 200 with the patched certifi bundle. Use Python 3.11 and UTF-8 for these Windows checks.
- `uv lock --check` and a frozen CPU sync dry run passed. Only Pillow and certifi versions changed versus main; nine dependencies belonging to the retired demo were removed.
