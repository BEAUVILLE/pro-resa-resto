diff --git a/README.md b/README.md
index 363029eca6ba1ec74e858e1453be0a87ce88849a..eb65cba2a1c44b39ce62540bfa378531e0287220 100644
--- a/README.md
+++ b/README.md
@@ -1,15 +1,15 @@
-# DIGIY RESA PRO
+# DIGIY RESA PRO — multi-métiers (héritage resto)
 
-Module PRO DIGIYLYFE.
+Module PRO DIGIYLYFE pour la gestion de réservations multi-métiers (héritage restauration conservé).
 
 ## Accès
 - Entrée : `index.html` → `pin.html`
 - Auth : `slug + PIN`
 - RPC : `digiy_verify_access(slug, pin, module)`
 - Session : `localStorage` (8h) + clé `DIGIY_ACCESS`
 
-## Fichiers
+## Fichiers (socle historique resto + usage multi-métiers)
 - `index.html` : redirection vers PIN
 - `pin.html` : porte sécurisée
 - `guard.js` : protection pages
 - `cockpit.html` : cockpit starter
