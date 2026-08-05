from app.services.arbor.router import route_intent


def handle_intent(intent_name, context_data):
    return route_intent(intent_name, context_data)
