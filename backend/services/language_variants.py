"""Regional language variants offered by the picker but not by any engine.

The picker lists "Portuguese (Brazil)" next to "Portuguese". No TTS engine
has a separate Brazilian language id (OmniVoice and the others only know
``pt``), so the variant is folded to its base language before it reaches an
engine, which would otherwise treat the unknown name as language-agnostic or
reject it. The accent still comes from the reference audio or voice.
"""
from __future__ import annotations

from typing import Optional

#: Picker label for Brazilian Portuguese; must match electron/src/shared/languages.json.
PT_BR_LABEL = "Portuguese (Brazil)"

_PT_BR_TOKENS = frozenset({
    "portuguese (brazil)",
    "brazilian portuguese",
    "pt-br",
    "pt_br",
    "ptbr",
})


def is_brazilian_portuguese(language: object) -> bool:
    return isinstance(language, str) and language.strip().lower() in _PT_BR_TOKENS


def canonical_language(language: Optional[str]) -> Optional[str]:
    """Fold a regional picker variant to the base language engines understand."""
    return "Portuguese" if is_brazilian_portuguese(language) else language
