import re
"""Response contract validates completeness without recalculating financial data."""
import json
from datetime import datetime
from app.services.account_export import SECTIONS


def validate_export(value, owner):
    if not isinstance(value, dict) or value.get('schema_version') != '1' or value.get('complete') is not True:
        raise ValueError('Incomplete export')
    if not isinstance(value.get('account'), dict) or value['account'].get('id') != owner:
        raise ValueError('Owner mismatch')
    if any(not isinstance(value.get(key), list) for key in SECTIONS):
        raise ValueError('Missing section')
    availability = value.get('source_availability')
    if not isinstance(availability, dict) or availability.get('ask_usage') not in ('table_present', 'table_absent'):
        raise ValueError('Missing source availability')
    if availability['ask_usage'] == 'table_absent' and value['ask_usage']:
        raise ValueError('Unavailable source contains rows')
    metadata = value['export_operational_metadata']
    if len(metadata) != 1 or not isinstance(metadata[0], dict) or set(metadata[0]) != {'cooldown_until'} or not isinstance(metadata[0]['cooldown_until'], str):
        raise ValueError('Invalid export operational metadata')
    if len(metadata[0]['cooldown_until']) > 64 or datetime.fromisoformat(metadata[0]['cooldown_until']).tzinfo is None:
        raise ValueError('Invalid cooldown timestamp')
    if len(json.dumps(value).encode()) > 20971520:
        raise ValueError('Oversized export')
    for row in value["profile"]:
        check_nested(row.get("v2_inputs"), V2_SHAPE)
    for section, allowed in {
        'account_lifecycle': {'state','version','deactivated_at','changed_at'},
        'deletion_requests': {'request_id','status','requested_at','withdrawn_at'},
        'erasure_operations': {'id','state','verified_at','holds','completed_at','receipt_expires_at','provider_status'},
    }.items():
        if section in value:
            rows = value[section]
            if not isinstance(rows, list) or len(rows)>1 or any(not isinstance(row,dict) or set(row)-allowed for row in rows):
                raise ValueError('Invalid lifecycle export section')
    terms=value.get('terms_acceptances',[])
    if not isinstance(terms,list) or len(terms)>1000 or any(not isinstance(row,dict) or set(row)!={'version','content_digest','accepted_at','source'} or row['source'] not in ('signup','account') for row in terms):
        raise ValueError('Invalid Terms export section')
    for row in terms:
        if not isinstance(row['version'],str) or not 1<=len(row['version'])<=64 or not isinstance(row['content_digest'],str) or not re.fullmatch(r'[0-9a-f]{64}',row['content_digest']) or not isinstance(row['accepted_at'],str) or datetime.fromisoformat(row['accepted_at']).tzinfo is None:
            raise ValueError('Invalid Terms receipt')
    for row in value.get('erasure_operations', []):
        if not isinstance(row.get('holds'), list) or len(row['holds']) > 12:
            raise ValueError('Invalid erasure holds')
        for hold in row['holds']:
            if not isinstance(hold, dict) or set(hold) != {'category','reason','review_at','end_at'} or any(not isinstance(item, str) for item in hold.values()):
                raise ValueError('Invalid erasure hold field')
    return value

V2_SHAPE = {'kind': 'object', 'fields': {'emergency_savings': {'kind': 'scalar'}, 'high_interest_debt': {'kind': 'scalar'}, 'horizon': {'kind': 'scalar'}, 'risk_response': {'kind': 'scalar'}, 'goal_name': {'kind': 'scalar'}, 'goal_date': {'kind': 'scalar'}, 'saved_preferences': {'kind': 'object', 'fields': {'technology_tilt': {'kind': 'scalar'}, 'bitcoin': {'kind': 'scalar'}}}, 'selected_approach': {'kind': 'scalar'}, 'explicit_customization': {'kind': 'object', 'fields': {'technology_tilt': {'kind': 'scalar'}, 'bitcoin': {'kind': 'scalar'}}}, 'implementation_choices': {'kind': 'object', 'fields': {'global_equity': {'kind': 'scalar'}, 'defensive': {'kind': 'scalar'}, 'technology_tilt': {'kind': 'scalar'}, 'crypto': {'kind': 'scalar'}}}, 'plan_state': {'kind': 'object', 'fields': {'historical_plan': {'kind': 'object', 'fields': {'plan_basis': {'kind': 'scalar'}, 'strategy_engine_version': {'kind': 'scalar'}, 'selection': {'kind': 'object', 'fields': {'risk_response': {'kind': 'scalar'}, 'horizon': {'kind': 'scalar'}, 'requested_strategy': {'kind': 'scalar'}, 'horizon_maximum_strategy': {'kind': 'scalar'}, 'strategy_path': {'kind': 'object', 'fields': {'path': {'kind': 'scalar'}, 'strategy_engine_version': {'kind': 'scalar'}, 'base_strategy': {'kind': 'scalar'}}}, 'selected_strategy': {'kind': 'scalar'}, 'is_short_term': {'kind': 'scalar'}, 'cap_applied': {'kind': 'scalar'}, 'reason': {'kind': 'scalar'}}}, 'readiness': {'kind': 'object', 'fields': {'readiness': {'kind': 'scalar'}, 'core_strategy_can_be_shown': {'kind': 'scalar'}, 'actionable_contribution_guidance_allowed': {'kind': 'scalar'}, 'technology_satellite_readiness_eligible': {'kind': 'scalar'}, 'bitcoin_satellite_readiness_eligible': {'kind': 'scalar'}, 'message_requirement': {'kind': 'scalar'}}}, 'inflation_pct': {'kind': 'scalar'}, 'preference_result': {'kind': 'object', 'fields': {'technology_tilt': {'kind': 'object', 'fields': {'requested_percentage_points': {'kind': 'scalar'}, 'effective_percentage_points': {'kind': 'scalar'}, 'strategy_cap_percentage_points': {'kind': 'scalar'}, 'reasons': {'kind': 'array', 'item': {'kind': 'scalar'}}}}, 'bitcoin': {'kind': 'object', 'fields': {'requested_percentage_points': {'kind': 'scalar'}, 'effective_percentage_points': {'kind': 'scalar'}, 'strategy_cap_percentage_points': {'kind': 'scalar'}, 'reasons': {'kind': 'array', 'item': {'kind': 'scalar'}}}}, 'effective_target': {'kind': 'object', 'fields': {'strategy_engine_version': {'kind': 'scalar'}, 'base_strategy': {'kind': 'scalar'}, 'allocation': {'kind': 'object', 'fields': {'weights': {'kind': 'array', 'item': {'kind': 'object', 'fields': {'role': {'kind': 'scalar'}, 'percentage_points': {'kind': 'scalar'}}}}}}}}}}, 'dormant_selected_approach': {'kind': 'scalar'}, 'historical_allocation_preserved': {'kind': 'scalar'}, 'customization': {'kind': 'object', 'fields': {'technology_tilt': {'kind': 'scalar'}, 'bitcoin': {'kind': 'scalar'}, 'provenance': {'kind': 'scalar'}}}, 'final_allocation': {'kind': 'array', 'item': {'kind': 'object', 'fields': {'role': {'kind': 'scalar'}, 'percentage_points': {'kind': 'scalar'}}}}, 'path': {'kind': 'scalar'}, 'selected_strategy': {'kind': 'scalar'}, 'base_allocation': {'kind': 'scalar'}, 'planning_return_pct': {'kind': 'scalar'}}}, 'revision_nonce': {'kind': 'scalar'}, 'explicit_target': {'kind': 'object', 'fields': {'strategy_engine_version': {'kind': 'scalar'}, 'base_strategy': {'kind': 'scalar'}, 'allocation': {'kind': 'object', 'fields': {'weights': {'kind': 'array', 'item': {'kind': 'object', 'fields': {'role': {'kind': 'scalar'}, 'percentage_points': {'kind': 'scalar'}}}}}}}}, 'customization_provenance': {'kind': 'scalar'}}, 'omit': ['revision_nonce']}}}

def check_nested(value, shape, depth=0):
    if value is None: return
    if depth > 32: raise ValueError("Nested export too deep")
    if shape["kind"] == "object":
        if not isinstance(value, dict) or set(value)-set(shape["fields"]): raise ValueError("Unknown export field")
        if any(key in value for key in shape.get("omit", [])): raise ValueError("Internal export field")
        for key, item in value.items(): check_nested(item, shape["fields"][key], depth+1)
    elif shape["kind"] == "array":
        if not isinstance(value, list) or len(value)>100: raise ValueError("Invalid export array")
        for item in value: check_nested(item, shape["item"], depth+1)
    elif isinstance(value, (dict, list)): raise ValueError("Invalid export scalar")
