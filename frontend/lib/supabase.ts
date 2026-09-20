import { createClient } from "@supabase/supabase-js";
import { createRecoveryTracker } from "./passwordRecovery";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
);

// Subscribe before asynchronous SDK URL initialization emits PASSWORD_RECOVERY.
// No tokens are copied; SDK session storage and URL handling remain unchanged.
export const passwordRecovery = createRecoveryTracker();
supabase.auth.onAuthStateChange((event, session) => {
  passwordRecovery.authChanged(event, session);
});
