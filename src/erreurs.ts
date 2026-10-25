/**
 * Erreur pismile : `code` est stable (à tester dans votre code), `message` est lisible.
 *
 * Codes de l'API : `authentification`, `autorisation_absente`, `compte_absent`, `montant_invalide`,
 * `reference_invalide`, `reference_deja_utilisee`, `motif_invalide`, `sub_manquant`, `scope_non_autorise`,
 * `module_encaissement_requis`, `acces_participant_non_verifie`, `organisation_non_verifiee`, `quota_atteint`,
 * `trop_de_demandes_en_attente`, `limite_journaliere`, `participant_refus`, `paiement_introuvable`…
 * Codes du SDK : `reseau`, `delai_depasse`, `reponse_invalide`, `configuration`, `signature_invalide`,
 * `signature_expiree`.
 */
export class PismileErreur extends Error {
    /** Statut HTTP (0 si aucune réponse). */
    readonly statut: number;
    readonly code: string;

    constructor(code: string, message: string, statut = 0) {
        super(message);
        this.name = "PismileErreur";
        this.code = code;
        this.statut = statut;
    }
}
