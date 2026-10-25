/**
 * @pismile/node — SDK serveur pismile pour Node.js.
 *
 * Envoie des demandes de paiement PI-SPI (BCEAO) aux utilisateurs connectés avec « Se connecter avec pismile »
 * (scope `pismile:payment`) : ils valident dans leur banque, l'argent arrive sur le compte de votre organisation.
 * Vérifie aussi la signature des webhooks.
 */
export { Pismile, Paiements, Sessions, Webhooks, type OptionsPismile } from "./client.js";
export { PismileErreur } from "./erreurs.js";
export { verifierWebhook, signerWebhook, ENTETE_SIGNATURE, type OptionsVerification } from "./webhooks.js";
export {
    SCOPE_PAIEMENT,
    type Paiement,
    type NouveauPaiement,
    type StatutPaiement,
    type SessionPaiement,
    type NouvelleSession,
    type StatutSession,
    type TypeEvenement,
    type EvenementWebhook,
} from "./types.js";
