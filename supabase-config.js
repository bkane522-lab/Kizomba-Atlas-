window.KIZOMBA_ATLAS_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  DEFAULT_MAP_CENTER: [46.603354, 1.888334],
  DEFAULT_MAP_ZOOM: 6
};

window.isSupabaseConfigured = function () {
  const config = window.KIZOMBA_ATLAS_CONFIG || {};
  return Boolean(
    config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("VOTRE_") &&
    !config.SUPABASE_ANON_KEY.includes("VOTRE_")
  );
};
