"""Brazilian Portuguese is a picker option that folds onto Portuguese for engines."""
import json
from pathlib import Path

from services.language_variants import PT_BR_LABEL, canonical_language, is_brazilian_portuguese

ROOT = Path(__file__).resolve().parents[1]


def test_picker_offers_brazilian_portuguese_next_to_portuguese():
    for picker in ("electron/src/shared/languages.json", "electron/src/renderer/src/lib/languages.json"):
        names = json.loads((ROOT / picker).read_text(encoding="utf-8"))
        assert names[names.index("Portuguese") + 1] == PT_BR_LABEL


def test_variant_folds_to_base_language_only_for_pt_br():
    for token in (PT_BR_LABEL, "pt-BR", "pt_br", "Brazilian Portuguese"):
        assert is_brazilian_portuguese(token)
        assert canonical_language(token) == "Portuguese"
    for token in ("Portuguese", "pt", "pt-PT", "Spanish", "Auto", None):
        assert canonical_language(token) == token


def test_finite_engine_accepts_brazilian_portuguese_label():
    from services.tts_backend import TTSBackend

    # The method only reads its argument, so no concrete engine is needed.
    assert TTSBackend._normalize_language_code(object(), PT_BR_LABEL) == "pt"
    assert TTSBackend._normalize_language_code(object(), "pt-BR") == "pt"


def test_unset_portuguese_dub_dialect_defaults_to_brazil():
    from api.routers.dub_translate import dialect_clause, effective_dialect

    assert effective_dialect(None, "pt") == "pt-BR"
    assert effective_dialect("", "pt") == "pt-BR"
    assert effective_dialect("pt-PT", "pt") == "pt-PT"
    assert effective_dialect(None, "es") is None
    assert "Brazilian" in dialect_clause(effective_dialect(None, "pt"))
