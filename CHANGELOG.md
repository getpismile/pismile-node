# Historique des versions

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).

## [0.1.0] — 2026-10-25

### Ajouté

- Pages de paiement pismile.com (bouton « Payer avec Alias PI-SPI ») : création, lecture par identifiant ou par référence.
- Demandes de paiement aux utilisateurs « Se connecter avec pismile » (scope `pismile:payment`).
- Vérification des webhooks (`Pismile-Signature`, HMAC-SHA256, tolérance 5 minutes).
- Erreurs typées avec un code stable ; nouveaux essais automatiques après une coupure réseau ou une erreur 5xx temporaire.
