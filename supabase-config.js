window.KIZOMBA_ATLAS_CONFIG = {
  // Remplacez ces deux valeurs par celles de votre projet Supabase.
  // Project Settings → API
  SUPABASE_URL: "YOUR_SUPABASE_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",

  DEMO_FALLBACK: true,

  DEFAULT_MAP_CENTER: [47.2, 3.0],
  DEFAULT_MAP_ZOOM: 6
};

window.isSupabaseConfigured = function isSupabaseConfigured() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.KIZOMBA_ATLAS_CONFIG;
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("YOUR_") &&
    !SUPABASE_ANON_KEY.includes("YOUR_")
  );
};
