/** Scope OpenID Connect à demander à la connexion pour pouvoir envoyer des demandes de paiement. */
export const SCOPE_PAIEMENT = "pismile:payment";

/**
 * Statut d'un paiement.
 * - `EN_ATTENTE` : la demande est dans la banque de l'utilisateur, à valider (24 h au plus) ;
 * - `PAYE` : payé, définitif (l'argent est sur votre compte) ;
 * - `REFUSE` / `ANNULE` / `EXPIRE` : rien n'a été débité ;
 * - `ECHEC` : votre participant PI-SPI a refusé la demande avant envoi (la référence peut être réutilisée).
 */
export type StatutPaiement = "EN_ATTENTE" | "PAYE" | "REFUSE" | "ANNULE" | "EXPIRE" | "ECHEC";

/** Un paiement, tel que renvoyé par l'API et contenu dans les webhooks. Dates au format ISO 8601 (UTC). */
export interface Paiement {
    id: string;
    /** Votre référence (unique). */
    reference?: string;
    /** Identifiant de l'utilisateur (le même qu'à la connexion). */
    sub: string;
    /** Montant en F CFA. */
    montant: number;
    devise: "XOF";
    /** Motif affiché dans la banque du payeur : « Nom de votre application - votre motif ». */
    motif?: string;
    statut: StatutPaiement;
    /** Compte du payeur, masqué (« Wave · +228 •••• 12 »). */
    compte?: string;
    creeLe: string;
    expireLe: string;
    payeLe?: string;
    /** Raison donnée par PI-SPI en cas de refus ou d'échec. */
    raison?: string;
    /** true pour une application en mode test (sandbox). */
    test: boolean;
}

export interface NouveauPaiement {
    /** `sub` reçu à la connexion « Se connecter avec pismile » (avec le scope `pismile:payment`). */
    sub: string;
    /** Montant entier en F CFA. */
    montant: number;
    /** Votre référence, unique (1 à 64 caractères : lettres, chiffres, `. _ : -`). La renvoyer ne crée jamais un second paiement. */
    reference: string;
    /** Facultatif, 100 caractères au plus (lettres, chiffres, ponctuation courante, pas d'émoji). */
    motif?: string;
}

/** Statut d'une page de paiement pismile.com. */
export type StatutSession = "OUVERTE" | "PAYEE" | "EXPIREE" | "ANNULEE";

/** Une page de paiement pismile.com (« Payer avec Alias PI-SPI »). Dates ISO 8601 (UTC). */
export interface SessionPaiement {
    /** Identifiant (`cs_…`). */
    id: string;
    /** Page où envoyer le payeur : https://pismile.com/payer/cs_… */
    url: string;
    reference: string;
    /** Montant en F CFA. */
    montant: number;
    devise: "XOF";
    motif: string;
    statut: StatutSession;
    /** Déjà payé : une page expirée peut avoir été payée en partie (plusieurs comptes) — à compléter ou rembourser. */
    montantPaye: number;
    creeLe: string;
    expireLe: string;
    payeLe?: string;
    test: boolean;
}

export interface NouvelleSession {
    /** Montant entier en F CFA. */
    montant: number;
    /** Votre référence, unique. La renvoyer renvoie la même page. */
    reference: string;
    /** Adresse HTTPS de retour, sur un domaine vérifié de votre organisation. Reçoit `?pismile_session=…&statut=…`. */
    retour: string;
    /** Facultatif : adresse si le payeur abandonne (défaut : `retour`). */
    annulation?: string;
    /** Facultatif, 100 caractères au plus. */
    motif?: string;
}

/** Type d'un événement de webhook. */
export type TypeEvenement =
    | "paiement.paye"
    | "paiement.refuse"
    | "paiement.annule"
    | "paiement.expire"
    | "session.payee"
    | "session.expiree"
    | "test";

/** Corps d'un webhook pismile, une fois la signature vérifiée. */
export type EvenementWebhook =
    | {
          id: string;
          type: "paiement.paye" | "paiement.refuse" | "paiement.annule" | "paiement.expire";
          creeLe: string;
          test: boolean;
          donnees: Paiement;
      }
    | {
          id: string;
          type: "session.payee" | "session.expiree";
          creeLe: string;
          test: boolean;
          donnees: SessionPaiement;
      }
    | {
          id: string;
          type: "test";
          creeLe: string;
          test: boolean;
          donnees: { message: string; application: string };
      };
