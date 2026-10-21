"""Published Windows notes must belong to the exact release being shipped."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from prepare_electron_release import release_notes


def test_release_notes_preserve_portuguese_and_exclude_adjacent_versions(tmp_path):
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text(
        "## [Unreleased]\nFuture\n## [0.5.9] — 2026-10-21\n\n"
        "Proteção da voz e sessões.\n\n## [0.5.8]\nOld\n", encoding="utf-8",
    )
    assert release_notes("0.5.9", changelog) == "Proteção da voz e sessões.\n"


@pytest.mark.parametrize("content", ["## [0.5.8]\nOld\n", "## [0.5.9]\n\n## [0.5.8]\nOld\n"])
def test_release_notes_refuse_missing_or_empty_version(tmp_path, content):
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text(content, encoding="utf-8")
    with pytest.raises(ValueError, match="versioned CHANGELOG"):
        release_notes("0.5.9", changelog)
