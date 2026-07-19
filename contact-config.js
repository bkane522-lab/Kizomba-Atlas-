window.KIZOMBA_ATLAS_CONTACT = {
  // Ajoutez ici une adresse créée spécialement pour Kizomba Atlas.
  // Exemple : "contact@votre-domaine.fr"
  EMAIL: "",

  // Facultatif : lien complet vers le profil officiel Kizomba Atlas.
  // Exemple : "https://www.instagram.com/kizombaatlas/"
  INSTAGRAM_URL: "",

  // Nom public affiché dans les messages. Aucun nom personnel n'est nécessaire.
  PUBLIC_NAME: "L’équipe Kizomba Atlas"
};

window.isKizombaAtlasContactConfigured = function () {
  const config = window.KIZOMBA_ATLAS_CONTACT || {};
  return Boolean(config.EMAIL && config.EMAIL.includes("@"));
};
