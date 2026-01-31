# DIGIY RESA PRO

Module PRO DIGIYLYFE.

## Accès
- Entrée : `index.html` → `pin.html`
- Auth : `slug + PIN`
- RPC : `digiy_verify_access(slug, pin, module)`
- Session : `localStorage` (8h) + clé `DIGIY_ACCESS`

## Fichiers
- `index.html` : redirection vers PIN
- `pin.html` : porte sécurisée
- `guard.js` : protection pages
- `cockpit.html` : cockpit starter
