window.KIZOMBA_ATLAS_CONTACT = {
  // Adresse qui reçoit les propositions d'événements.
  // Elle apparaît publiquement dans les liens de la page Contact.
  EMAIL: "kizombaatlas.contact@gmail.com",

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
