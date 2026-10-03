import os

from dotenv import load_dotenv
from supabase import create_client
from app.authenticated_data import AuthenticatedDataClient

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

supabase = create_client(supabase_url, supabase_key)


def get_authenticated_client(access_token: str):
    if not access_token:
        raise ValueError("Authenticated data access requires an access token")
    return AuthenticatedDataClient(supabase_url, supabase_key, access_token)
