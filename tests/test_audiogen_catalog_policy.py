"""Music / sound-effects catalogue, declared-use policy, parameters, provenance.

Offline by construction: nothing here touches the network or the HF cache.
"""
import copy

import pytest

from services.audiogen import catalog, params, policy, provenance

EXPECTED = {
    "ace-step-v1": ("music", catalog.COMMERCIAL),
    "musicgen-small": ("music", catalog.NONCOMMERCIAL),
    "musicgen-stereo-medium": ("music", catalog.NONCOMMERCIAL),
    "stable-audio-open-1.0": ("sfx", catalog.COMMERCIAL_CONDITIONS),
    "audioldm2": ("sfx", catalog.NONCOMMERCIAL),
}


def test_every_required_path_is_present_with_its_licence_class():
    assert {m["id"] for m in catalog.entries()} == set(EXPECTED)
    for mid, (kind, klass) in EXPECTED.items():
        model = catalog.get(mid)
        assert model["kind"] == kind
        assert catalog.classify(model["repo_id"]) == (klass, [])


def test_commercial_label_requires_complete_evidence(monkeypatch):
    repo = catalog.get("ace-step-v1")["repo_id"]
    row = copy.deepcopy(catalog._registry_row(repo))
    row["audiogen_evidence"]["evidence_documents"] = []
    monkeypatch.setattr(catalog, "_registry_row", lambda r: row if r == repo else None)
    klass, problems = catalog.classify(repo)
    assert klass == catalog.UNCONFIRMED and "documents_missing" in problems


def test_commercial_label_breaks_when_pin_and_record_disagree(monkeypatch):
    repo = catalog.get("ace-step-v1")["repo_id"]
    row = copy.deepcopy(catalog._registry_row(repo))
    row["runtime_revision"] = "0" * 40
    monkeypatch.setattr(catalog, "_registry_row", lambda r: row if r == repo else None)
    klass, problems = catalog.classify(repo)
    assert klass == catalog.UNCONFIRMED and "revision_mismatch" in problems


def test_unknown_repo_is_unconfirmed():
    assert catalog.classify("nobody/nothing")[0] == catalog.UNCONFIRMED


def test_public_catalog_exposes_license_blocks_without_io():
    data = catalog.public_catalog()
    sao = next(m for m in data["models"] if m["id"] == "stable-audio-open-1.0")
    assert sao["license"]["class"] == catalog.COMMERCIAL_CONDITIONS
    assert sao["license"]["conditions"]["revenue_threshold_usd"] == 1_000_000
    assert sao["license"]["conditions"]["registration_required"] is True
    assert sao["download"]["gated"] is True
    assert data["default_purpose"] == "personal"


# ── policy ───────────────────────────────────────────────────────────────────


def test_personal_is_default_and_allows_any_model():
    for mid, (kind, _) in EXPECTED.items():
        decision = policy.decide(mid, kind, None)
        assert decision.purpose == "personal"


@pytest.mark.parametrize("mid", ["musicgen-small", "musicgen-stereo-medium"])
def test_commercial_refuses_noncommercial_music_and_names_alternatives(mid):
    with pytest.raises(policy.PolicyError) as err:
        policy.decide(mid, "music", "commercial")
    assert err.value.status == 403 and err.value.code == "model_not_eligible_for_commercial"
    assert err.value.extra["alternatives"] == ["ace-step-v1"]


def test_commercial_refuses_noncommercial_sfx_and_offers_conditional_model():
    with pytest.raises(policy.PolicyError) as err:
        policy.decide("audioldm2", "sfx", "commercial")
    assert err.value.extra["alternatives"] == ["stable-audio-open-1.0"]


def test_commercial_with_conditions_needs_an_explicit_acknowledgement():
    with pytest.raises(policy.PolicyError) as err:
        policy.decide("stable-audio-open-1.0", "sfx", "commercial")
    assert err.value.status == 409 and err.value.code == "commercial_conditions_confirmation_required"
    with pytest.raises(policy.PolicyError):
        policy.decide("stable-audio-open-1.0", "sfx", "commercial", conditions_ack="true")  # not a bool
    ok = policy.decide("stable-audio-open-1.0", "sfx", "commercial", conditions_ack=True)
    assert ok.conditions_acknowledged and ok.license_class == catalog.COMMERCIAL_CONDITIONS


def test_commercial_apache_model_needs_no_extra_acknowledgement():
    ok = policy.decide("ace-step-v1", "music", "commercial")
    assert ok.purpose == "commercial" and not ok.conditions_acknowledged


def test_unconfirmed_license_is_refused_for_commercial(monkeypatch):
    monkeypatch.setattr(catalog, "classify", lambda repo: (catalog.UNCONFIRMED, ["evidence_missing"]))
    with pytest.raises(policy.PolicyError) as err:
        policy.decide("ace-step-v1", "music", "commercial")
    assert err.value.code == "model_license_unconfirmed"


def test_wrong_kind_unknown_model_and_bad_purpose():
    with pytest.raises(policy.PolicyError) as err:
        policy.decide("ace-step-v1", "sfx", None)
    assert err.value.status == 404
    with pytest.raises(policy.PolicyError) as err:
        policy.decide("nope", "music", None)
    assert err.value.status == 404
    with pytest.raises(policy.PolicyError) as err:
        policy.decide("ace-step-v1", "music", "enterprise")
    assert err.value.code == "invalid_purpose"


# ── parameters ───────────────────────────────────────────────────────────────


def plan(mid="ace-step-v1", **kw):
    kw.setdefault("prompt", "calm piano")
    return params.build_plan(catalog.get(mid), **kw)


def test_defaults_use_the_default_profile_and_fixed_params():
    p = plan()
    assert p.profile == "balanced" and p.params["infer_step"] == 60
    assert p.params["scheduler_type"] == "euler"
    assert 0 <= p.seed and p.variations == 1


def test_profiles_change_steps():
    assert plan(profile="fast").params["infer_step"] == 27
    assert plan(profile="high").params["infer_step"] == 100


def test_custom_requires_custom_profile_and_respects_bounds():
    with pytest.raises(params.ParamError) as err:
        plan(custom={"infer_step": 50})
    assert err.value.code == "custom_params_need_custom_profile"
    assert plan(profile="custom", custom={"infer_step": 50}).params["infer_step"] == 50
    with pytest.raises(params.ParamError):
        plan(profile="custom", custom={"infer_step": 5000})
    with pytest.raises(params.ParamError):
        plan(profile="custom", custom={"not_a_param": 1})
    with pytest.raises(params.ParamError):
        plan(profile="custom")


def test_limits_are_enforced():
    with pytest.raises(params.ParamError):
        plan("musicgen-small", duration_s=31)
    with pytest.raises(params.ParamError):
        plan("audioldm2", duration_s=11)
    with pytest.raises(params.ParamError):
        plan(variations=5)
    with pytest.raises(params.ParamError):
        plan(prompt="")
    with pytest.raises(params.ParamError):
        plan(prompt="x" * 1001)
    with pytest.raises(params.ParamError) as err:
        plan("musicgen-small", lyrics="la la")
    assert err.value.code == "lyrics_not_supported"


def test_explicit_seed_is_kept():
    assert plan(seed=1234).seed == 1234


# ── provenance ───────────────────────────────────────────────────────────────


def _record(mid="stable-audio-open-1.0", **decide_kw):
    model = catalog.get(mid)
    decision = policy.decide(mid, model["kind"], decide_kw.pop("purpose", "personal"), **decide_kw)
    p = plan(mid, seed=7)
    return provenance.build(p, decision, content_preset=None, audio={"sample_rate": 44100, "channels": 2},
                            runtime={"device": "cpu"}, variation=1, app_version="0.5.11")


def test_provenance_records_declaration_revision_and_params():
    record = _record(purpose="commercial", conditions_ack=True)
    assert record["recorded"] and record["declared_use"]["purpose"] == "commercial"
    assert record["declared_use"]["conditions_acknowledged"] is True
    assert record["model"]["revision"] == "f21265c1e2710b3bd2386596943f0007f55f802e"
    assert record["parameters"]["seed"] == 8 and record["parameters"]["variation"] == 1
    assert "prompt" not in record["parameters"]  # only its length is kept
    text = provenance.render_text(record, prompt="x")
    assert "not a licence" in text.lower() and "USD 1,000,000" in text


def test_personal_record_is_never_marked_acknowledged():
    assert _record(purpose="personal")["declared_use"]["conditions_acknowledged"] is False


def test_old_or_broken_rows_are_not_recorded_and_imply_nothing():
    for raw in (None, "", "not json", '{"schema": 99}', "[]"):
        assert provenance.loads(raw) == {"recorded": False}
    assert "not recorded" in provenance.render_text({"recorded": False}).lower()


def test_provenance_roundtrip():
    record = _record()
    assert provenance.loads(provenance.dumps(record)) == record
