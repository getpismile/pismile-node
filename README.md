# @pismile/node

[![npm](https://img.shields.io/npm/v/@pismile/node)](https://www.npmjs.com/package/@pismile/node) [![Tests](https://github.com/getpismile/pismile-node/actions/workflows/ci.yml/badge.svg)](https://github.com/getpismile/pismile-node/actions/workflows/ci.yml)

SDK serveur **pismile** pour Node.js : encaissez par **PI-SPI** (BCEAO) avec le bouton **« Payer avec Alias PI-SPI »**,
envoyez des demandes de paiement à vos utilisateurs « Se connecter avec pismile », et vérifiez les **webhooks**.

L'utilisateur valide (ou refuse) chaque demande dans sa banque ; l'argent arrive **directement sur le compte de votre
organisation**, avec votre propre accès participant PI-SPI. pismile ne détient jamais les fonds.

> À utiliser **uniquement côté serveur** : le `client_secret` ne doit jamais aller dans un navigateur ni une appli mobile.

## Prérequis

Dans votre [console pismile](https://pismile.com/console) → Applications → votre application → **Paiements** :

1. le module **Encaissement** activé, avec votre **accès participant** PI-SPI vérifié (AFA-Pay, MTN…) : l'argent
   arrive directement sur votre compte ;
2. pour une application de production : votre organisation vérifiée ;
3. page de paiement : votre adresse de retour sur un **domaine vérifié** (console → Domaines) ;
4. demandes à un utilisateur connecté : un plan qui inclut le scope `pismile:payment`, coché sur l'application.

## Installation

```bash
npm install @pismile/node
```

```bash
# .env
PISMILE_CLIENT_ID=votre_client_id            # AUTH_PISMILE_ID est aussi accepté (comme @pismile/authjs)
PISMILE_CLIENT_SECRET=votre_client_secret    # ou AUTH_PISMILE_SECRET
PISMILE_WEBHOOK_SECRET=whsec_...      # affiché une fois dans la console, page Paiements
```

## Le plus simple : la page de paiement pismile.com

Affichez le bouton ; votre client paie sur pismile.com — **sans compte**, avec son alias PI-SPI, seul ou en
**partageant le montant sur plusieurs comptes** — puis revient sur votre site.

```html
<script src="https://pismile.com/kit/v1/pismile-button.js" defer></script>
<pismile-button text="pay" href="/commande/1042/payer"></pismile-button>
```

```ts
// /commande/1042/payer (Express)
app.get("/commande/:id/payer", async (req, res) => {
  const commande = await trouverCommande(req.params.id)
  const session = await pismile.sessions.creer({
    montant: commande.total,                       // F CFA
    motif: `Commande ${commande.id}`,
    reference: `cmd-${commande.id}`,               // la renvoyer renvoie la même page
    retour: "https://votre-site.com/paiement/merci", // domaine vérifié (console → Domaines)
  })
  res.redirect(303, session.url)                   // https://pismile.com/payer/cs_…
})
```

Au retour, l'adresse reçoit `?pismile_session=cs_…&statut=payee` : **confirmez avec le webhook `session.payee`**
(ou `pismile.sessions.lire(id)`), jamais avec la seule adresse de retour. La page reste ouverte 30 minutes ; si elle
expire après un paiement partiel (plusieurs comptes), le webhook `session.expiree` indique `montantPaye`.

## Ou : demander un paiement à un utilisateur connecté

### 1. Demander l'accord à la connexion

Ajoutez le scope `pismile:payment` : l'utilisateur accepte les demandes de paiement et choisit le compte qui les
recevra. Avec [`@pismile/authjs`](https://www.npmjs.com/package/@pismile/authjs) :

```ts
import Pismile from "@pismile/authjs"

Pismile({ scope: "openid profile pismile:payment" })
```

Gardez le `sub` de l'utilisateur (`session.user.id` avec Auth.js) : c'est lui qui désigne le payeur.

### 2. Demander un paiement

```ts
import { Pismile, PismileErreur } from "@pismile/node"

const pismile = new Pismile()

try {
  const paiement = await pismile.paiements.creer({
    sub: session.user.id,
    montant: 5000,               // F CFA, entier
    motif: "Commande 1042",      // affiché : « Votre application - Commande 1042 »
    reference: "cmd-1042",       // votre identifiant, unique
  })
  paiement.statut                // "EN_ATTENTE" : l'utilisateur valide dans sa banque (24 h au plus)
} catch (e) {
  if (e instanceof PismileErreur && e.code === "autorisation_absente") {
    // l'utilisateur n'a pas accepté pismile:payment (ou l'a retiré) : reconnectez-le avec ce scope
  }
}
```

**Même référence, jamais deux débits.** Après une coupure réseau, renvoyez la même `reference` : vous recevez la
demande existante. Le SDK réessaie déjà de lui-même après une coupure ou une erreur serveur temporaire.

Consulter :

```ts
await pismile.paiements.lire(paiement.id)
await pismile.paiements.lireParReference("cmd-1042")
```

### Statuts

| Statut | Signification |
|---|---|
| `EN_ATTENTE` | Demande dans la banque de l'utilisateur, à valider |
| `PAYE` | Payé, définitif : livrez la commande |
| `REFUSE` · `ANNULE` · `EXPIRE` | Rien n'a été débité |
| `ECHEC` | Votre participant a refusé la demande avant envoi ; la référence peut être réutilisée |

### Limites

3 demandes en attente et 20 demandes par 24 h, par utilisateur et par application ; montant entier en F CFA.

## Être prévenu : webhooks

Enregistrez l'adresse de votre webhook dans la console (page Paiements). pismile envoie un `POST` JSON signé quand une
page de paiement est **payée** (`session.payee`) ou **expirée** (`session.expiree`), et quand un paiement demandé à un
utilisateur est **payé, refusé, annulé ou expiré** (`paiement.*`). Répondez `2xx` en moins de 10 secondes ; sinon pismile réessaie
(1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h). Un même événement peut arriver deux fois : utilisez son `id`.

**Vérifiez toujours la signature, sur le corps brut.**

### Express

```ts
import express from "express"
import { Pismile } from "@pismile/node"

const pismile = new Pismile()
const app = express()

app.post("/webhooks/pismile", express.raw({ type: "application/json" }), (req, res) => {
  let evenement
  try {
    evenement = pismile.webhooks.verifier(req.body, req.headers["pismile-signature"])
  } catch {
    return res.sendStatus(400)
  }
  if (evenement.type === "session.payee" || evenement.type === "paiement.paye") {
    marquerPayee(evenement.donnees.reference)   // votre code
  }
  res.sendStatus(200)
})
```

### Next.js (route handler)

```ts
// app/api/webhooks/pismile/route.ts
import { Pismile } from "@pismile/node"

const pismile = new Pismile()

export async function POST(req: Request) {
  const corps = await req.text()
  try {
    const evenement = pismile.webhooks.verifier(corps, req.headers.get("pismile-signature"))
    if (evenement.type === "paiement.paye") {
      await marquerPayee(evenement.donnees.reference)
    }
  } catch {
    return new Response(null, { status: 400 })
  }
  return new Response(null, { status: 200 })
}
```

Le bouton **Envoyer un test** de la console envoie un événement `test`.

## Erreurs

Toutes les erreurs sont des `PismileErreur` avec un `code` stable, un `statut` HTTP et un `message` lisible :

| Code | Que faire |
|---|---|
| `authentification` | client_id ou client_secret incorrect |
| `autorisation_absente` | reconnecter l'utilisateur avec le scope `pismile:payment` |
| `compte_absent` | l'utilisateur doit ajouter un compte dans l'application pismile |
| `reference_deja_utilisee` | référence déjà prise par un autre paiement (autre montant ou autre utilisateur) |
| `trop_de_demandes_en_attente` · `limite_journaliere` | attendre que l'utilisateur traite ses demandes |
| `scope_non_autorise` · `module_encaissement_requis` · `acces_participant_non_verifie` · `organisation_non_verifiee` | voir la page Paiements de la console |
| `participant_refus` | votre participant PI-SPI a refusé : réessayez, puis testez votre accès dans la console |
| `reseau` · `delai_depasse` | pismile injoignable : réessayez avec la même référence |

## Options

```ts
new Pismile({
  clientId: "...",            // défaut : PISMILE_CLIENT_ID (ou AUTH_PISMILE_ID)
  clientSecret: "...",        // défaut : PISMILE_CLIENT_SECRET (ou AUTH_PISMILE_SECRET)
  issuer: "https://pismile.com", // défaut : PISMILE_ISSUER (ou AUTH_PISMILE_ISSUER)
  webhookSecret: "whsec_...", // défaut : PISMILE_WEBHOOK_SECRET
  delai: 15000,               // ms par appel
  essais: 2,                  // nouveaux essais (coupure réseau, erreur serveur temporaire)
})
```

## Documentation

Guides complets (liens de paiement, bouton, webhooks, référence de l'API) : [pismile.com/docs/paiements](https://pismile.com/docs/paiements/vue-ensemble).

## Développement

```bash
npm install
npm run build
npm test
```

## Licence

MIT
