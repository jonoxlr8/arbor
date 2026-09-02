import os

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")

supabase = create_client(supabase_url, supabase_key)


def get_authenticated_client(access_token: str):
    client = create_client(supabase_url, supabase_key)
    client.postgrest.auth(access_token)
    return client
