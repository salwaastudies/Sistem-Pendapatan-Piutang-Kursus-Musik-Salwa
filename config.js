// Ganti dua nilai berikut dengan Project URL dan Publishable/Anon Key dari Supabase.
// Jangan gunakan service_role/secret key di browser.

const SUPABASE_URL = "https://wwnsorqslpopmoixbrag.supabase.co";
const SUPABASE_KEY = "sb_publishable_7SadFl6OC36MWZxRW0d12A_mT40fhkM";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
