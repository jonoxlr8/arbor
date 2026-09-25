"""Pure preview composition. No DB writes, client targets or assessment authority."""
from uuid import uuid4

from app.schemas.profile_v2 import ProfileV2Data, ProfileV2Edit, ProfilePlanState
from app.services.profile_v2 import profile_v2_row, restore_profile_v2
from app.services.plan_customization import explicit_target


def prepare_profile_edit(row: dict, edit: ProfileV2Edit, user_id: str) -> tuple[dict, dict]:
    current = restore_profile_v2(row)
    if edit.expected_revision != current["revision"]:
        raise RuntimeError("stale_profile")
    original = current["profile"]
    selected = original.get("selected_approach")
    customization = original.get("explicit_customization")
    if edit.proposed_approach is not None:
        if (edit.inputs.horizon == "less_than_3_years") != (edit.proposed_approach == "short_term"):
            raise ValueError("Choose an approach for the proposed horizon")
        selected = edit.proposed_approach
        if selected == "short_term":
            customization = None
    if "explicit_customization" in edit.model_fields_set:
        customization = edit.explicit_customization
    profile = ProfileV2Data(**edit.inputs.model_dump(), selected_approach=selected,
                           saved_preferences=original["saved_preferences"],
                           explicit_customization=customization,
                           implementation_choices=original.get("implementation_choices", {}))
    historical = current.get("historical_plan")
    if historical is None and current["plan"]["plan_basis"] == "historical_assessment":
        historical = current["plan"]
    if historical is not None:
        # API selection output includes computed properties; persist only its inputs.
        historical = {**historical, "selection": {
            key: value for key, value in historical["selection"].items()
            if key not in {"selected_strategy", "is_short_term", "cap_applied", "reason"}
        }}
    state = ProfilePlanState(historical_plan=historical, revision_nonce=uuid4().hex,
        explicit_target=(explicit_target(profile.selected_approach, profile.explicit_customization)
                         if profile.explicit_customization is not None else None),
        customization_provenance="user_selected" if profile.explicit_customization is not None else None)
    proposed_row = profile_v2_row(profile, user_id)
    proposed_row["v2_inputs"]["plan_state"] = state.model_dump(mode="json", exclude_computed_fields=True)
    proposed = restore_profile_v2(proposed_row)
    return proposed_row, {"current":current, "proposed":proposed}
