# DIGIY RESA PRO — Oreille Métier

Module PRO DIGIYLYFE pour la réservation terrain : restaurant, accueil client, planning, établissement, rythme et fiche publique.

Ce dépôt suit la doctrine Oreille Métier validée le 24 mai 2026.

---

## Doctrine du jour

### Une page = un sujet

Chaque page garde son rôle. On ne mélange pas la navigation, la session, le planning et le travail vocal dans le même endroit.

- `index.html` : porte courte d’entrée / compatibilité.
- `hub.html` : navigation principale en pavés terrain.
- `session.html` : accès, session, nettoyage local, retour sécurisé.
- `oreille.html` : seule vraie page de travail vocal.
- `planning.html` : lecture et gestion du planning.
- `etablissement.html` : informations établissement.
- `fiche.html` : vitrine publique.
- `rythme.html` : rythme / disponibilités / fermetures.
- `qr.html` : QR et accès public.

Le hub oriente. La page agit.

---

## Règle Oreille Métier

L’Oreille RESA ne doit pas être chargée partout.

### Autorisé

`oreille.html` charge les scripts Oreille :

```html
<script src="./assets/js/oreille-metier-core.js" defer></script>
<script src="./assets/js/oreille-resa.js" defer></script>
```

### Interdit

Ne jamais charger ces scripts dans :

- `hub.html`
- `session.html`
- `index.html`
- `planning.html`
- `fiche.html`
- `etablissement.html`

Ces pages peuvent seulement ouvrir l’Oreille avec un lien clair :

```html
<a href="./oreille.html">🎙️ Oreille RESA</a>
```

---

## Moule technique validé

Chaque module DIGIYLYFE doit suivre ce moule :

```txt
assets/js/oreille-metier-core.js
assets/js/oreille-[module].js
oreille.html
hub.html
session.html
```

Pour RESA :

```txt
assets/js/oreille-metier-core.js
assets/js/oreille-resa.js
oreille.html
hub.html
session.html
```

---

## Ce que fait l’Oreille RESA

L’Oreille prépare le travail. Elle ne confirme rien toute seule.

Elle peut aider à formuler :

- une demande de réservation ;
- une réponse client ;
- une confirmation à vérifier ;
- une note rapide ;
- une fermeture ou indisponibilité à relire ;
- un message WhatsApp prêt à modifier ;
- une phrase propre pour le planning ou l’accueil.

Le pro parle ou clique. DIGIY met en forme. Le pro valide. Le logiciel range.

---

## Limites protégées

Rien n’est confirmé automatiquement :

- pas de paiement confirmé automatiquement ;
- pas de réservation confirmée automatiquement ;
- pas de prix figé automatiquement ;
- pas de stock ou capacité garanti automatiquement ;
- pas de promesse client envoyée sans validation ;
- pas de fermeture imposée sans confirmation du pro.

RESA aide à préparer. Le terrain garde la main.

---

## Accès et sécurité

- Entrée courte : `index.html`.
- Navigation principale : `hub.html`.
- Porte sécurisée : `pin.html` / `go-pin.html` selon le parcours.
- Protection : `guard.js`.
- Session locale : environ 8h.
- Ne pas afficher de téléphone ou d’identifiant sensible dans l’URL.
- Garder les routes existantes tant qu’il n’y a pas de bug réel.

---

## Routes importantes

```txt
./index.html
./hub.html
./session.html
./oreille.html
./planning.html
./etablissement.html
./fiche.html
./rythme.html
./qr.html
./pin.html
```

---

## Test de fermeture terrain

Après chaque correction, tester sur téléphone :

1. ouvrir `index.html` ;
2. vérifier que l’entrée mène proprement vers le parcours prévu ;
3. entrer par PIN si nécessaire ;
4. arriver sur `hub.html` ;
5. ouvrir `oreille.html` depuis le hub ;
6. vérifier que `hub.html` ne charge pas les scripts Oreille ;
7. ouvrir `session.html` ;
8. vérifier que `session.html` ne charge pas les scripts Oreille ;
9. tester planning, établissement, rythme, fiche et QR ;
10. vérifier qu’aucune page ne mouline à cause d’un script vocal chargé au mauvais endroit.

---

## Signature DIGIYLYFE

RESA doit rester simple, mobile, lisible et terrain.

Le client demande. Le pro confirme. DIGIY prépare. Le logiciel garde la trace.

**Le terrain garde la main.**
