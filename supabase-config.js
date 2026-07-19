window.KIZOMBA_ATLAS_CONFIG = {
  // Fallback local: laissez les placeholders si vous configurez Vercel.
  SUPABASE_URL: "YOUR_SUPABASE_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLISHABLE_KEY",
  ADMIN_EMAIL: "kizombaatlas.contact@gmail.com",

  DEMO_FALLBACK: true,
  DEFAULT_MAP_CENTER: [47.2, 3.0],
  DEFAULT_MAP_ZOOM: 6
};

window.isSupabaseConfigured = function isSupabaseConfigured() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.KIZOMBA_ATLAS_CONFIG;
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    /^https:\/\//i.test(SUPABASE_URL) &&
    !SUPABASE_URL.includes("YOUR_") &&
    !SUPABASE_ANON_KEY.includes("YOUR_")
  );
};

window.loadKizombaAtlasConfig = async function loadKizombaAtlasConfig() {
  const config = window.KIZOMBA_ATLAS_CONFIG;
  if (window.isSupabaseConfigured()) return config;

  try {
    const response = await fetch("/api/config", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });

    if (!response.ok) return config;
    const remote = await response.json();

    if (remote.supabaseUrl) config.SUPABASE_URL = remote.supabaseUrl;
    if (remote.supabasePublicKey) config.SUPABASE_ANON_KEY = remote.supabasePublicKey;
    if (remote.adminEmail) config.ADMIN_EMAIL = remote.adminEmail;
  } catch (error) {
    console.info("Configuration Vercel indisponible : fallback local utilisé.");
  }

  return config;
};
