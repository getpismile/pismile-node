import { PismileErreur } from "./erreurs.js";
import type { EvenementWebhook, NouveauPaiement, NouvelleSession, Paiement, SessionPaiement } from "./types.js";
import { verifierWebhook, type OptionsVerification } from "./webhooks.js";

export interface OptionsPismile {
    /** client_id de l'application. Défaut : PISMILE_CLIENT_ID (ou AUTH_PISMILE_ID). */
    clientId?: string;
    /** client_secret de l'application. Défaut : PISMILE_CLIENT_SECRET (ou AUTH_PISMILE_SECRET). Jamais côté navigateur. */
    clientSecret?: string;
    /** Adresse de pismile. Défaut : PISMILE_ISSUER (ou AUTH_PISMILE_ISSUER), sinon https://pismile.com. */
    issuer?: string;
    /** Secret des webhooks (`whsec_…`). Défaut : PISMILE_WEBHOOK_SECRET. */
    webhookSecret?: string;
    /** Délai maximal d'un appel, en millisecondes. Défaut : 15 000. */
    delai?: number;
    /** Nouveaux essais après une coupure réseau ou une erreur serveur temporaire. Défaut : 2. */
    essais?: number;
    /** fetch à utiliser (tests). Défaut : fetch de Node. */
    fetch?: typeof fetch;
}

const CHEMIN = "/api/v1/paiements";
const CHEMIN_SESSIONS = "/api/v1/sessions-paiement";

/**
 * Client pismile côté serveur.
 *
 * @example
 * ```ts
 * import { Pismile } from "@pismile/node"
 *
 * const pismile = new Pismile() // PISMILE_CLIENT_ID, PISMILE_CLIENT_SECRET
 * const paiement = await pismile.paiements.creer({
 *   sub: session.user.id, montant: 5000, motif: "Commande 1042", reference: "cmd-1042",
 * })
 * ```
 */
export class Pismile {
    readonly paiements: Paiements;
    readonly sessions: Sessions;
    readonly webhooks: Webhooks;

    constructor(options: OptionsPismile = {}) {
        const env = typeof process !== "undefined" ? process.env : {};
        const clientId = options.clientId ?? env.PISMILE_CLIENT_ID ?? env.AUTH_PISMILE_ID;
        const clientSecret = options.clientSecret ?? env.PISMILE_CLIENT_SECRET ?? env.AUTH_PISMILE_SECRET;
        if (!clientId || !clientSecret) {
            throw new PismileErreur("configuration",
                "clientId et clientSecret requis (ou variables PISMILE_CLIENT_ID et PISMILE_CLIENT_SECRET).");
        }
        const issuer = (options.issuer ?? env.PISMILE_ISSUER ?? env.AUTH_PISMILE_ISSUER ?? "https://pismile.com")
            .replace(/\/+$/, "");
        const http = new Http({
            base: issuer,
            autorisation: "Basic " + Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64"),
            delai: options.delai ?? 15_000,
            essais: Math.max(0, options.essais ?? 2),
            fetch: options.fetch ?? globalThis.fetch,
        });
        this.paiements = new Paiements(http);
        this.sessions = new Sessions(http);
        this.webhooks = new Webhooks(options.webhookSecret ?? env.PISMILE_WEBHOOK_SECRET);
    }
}

/** Demandes de paiement. */
export class Paiements {
    constructor(private readonly http: Http) {}

    /**
     * Envoie une demande de paiement à l'utilisateur : il la valide (ou la refuse) dans sa banque.
     * Réessayer avec la même `reference` est sans risque : la demande existante est renvoyée, jamais un second débit.
     */
    creer(paiement: NouveauPaiement): Promise<Paiement> {
        if (!paiement || !paiement.sub || !paiement.reference) {
            return Promise.reject(new PismileErreur("requete_invalide", "sub et reference sont obligatoires."));
        }
        if (!Number.isInteger(paiement.montant) || paiement.montant <= 0) {
            return Promise.reject(new PismileErreur("montant_invalide", "montant : entier positif en F CFA."));
        }
        return this.http.appeler<Paiement>("POST", CHEMIN, {
            sub: paiement.sub,
            montant: paiement.montant,
            motif: paiement.motif,
            reference: paiement.reference,
        });
    }

    /** Un paiement, par l'identifiant renvoyé à sa création. */
    lire(id: string): Promise<Paiement> {
        return this.http.appeler<Paiement>("GET", `${CHEMIN}/${encodeURIComponent(id)}`);
    }

    /** Un paiement, par votre référence. */
    lireParReference(reference: string): Promise<Paiement> {
        return this.http.appeler<Paiement>("GET", `${CHEMIN}?reference=${encodeURIComponent(reference)}`);
    }
}

/**
 * Pages de paiement pismile.com : le bouton « Payer avec Alias PI-SPI ». Aucun compte requis pour le payeur ; il peut
 * répartir le montant sur plusieurs comptes. Redirigez-le vers `session.url`.
 */
export class Sessions {
    constructor(private readonly http: Http) {}

    /** Crée la page de paiement (ou renvoie la même pour la même référence). */
    creer(session: NouvelleSession): Promise<SessionPaiement> {
        if (!session || !session.reference || !session.retour) {
            return Promise.reject(new PismileErreur("requete_invalide", "reference et retour sont obligatoires."));
        }
        if (!Number.isInteger(session.montant) || session.montant <= 0) {
            return Promise.reject(new PismileErreur("montant_invalide", "montant : entier positif en F CFA."));
        }
        return this.http.appeler<SessionPaiement>("POST", CHEMIN_SESSIONS, {
            montant: session.montant,
            motif: session.motif,
            reference: session.reference,
            retour: session.retour,
            annulation: session.annulation,
        });
    }

    lire(id: string): Promise<SessionPaiement> {
        return this.http.appeler<SessionPaiement>("GET", `${CHEMIN_SESSIONS}/${encodeURIComponent(id)}`);
    }

    lireParReference(reference: string): Promise<SessionPaiement> {
        return this.http.appeler<SessionPaiement>("GET", `${CHEMIN_SESSIONS}?reference=${encodeURIComponent(reference)}`);
    }
}

/** Webhooks : vérification de la signature avec le secret configuré. */
export class Webhooks {
    constructor(private readonly secret: string | undefined) {}

    /** Voir {@link verifierWebhook}. */
    verifier(corpsBrut: string | Uint8Array, entete: string | string[] | null | undefined,
             options?: OptionsVerification): EvenementWebhook {
        return verifierWebhook(corpsBrut, entete, this.secret ?? "", options);
    }
}

interface ReglagesHttp {
    base: string;
    autorisation: string;
    delai: number;
    essais: number;
    fetch: typeof fetch;
}

/** Statuts temporaires : un nouvel essai a des chances de réussir (la référence évite tout double paiement). */
const TEMPORAIRES = new Set([500, 503, 504]);

class Http {
    constructor(private readonly r: ReglagesHttp) {}

    async appeler<T>(methode: "GET" | "POST", chemin: string, corps?: unknown): Promise<T> {
        let derniere: PismileErreur | undefined;
        for (let essai = 0; essai <= this.r.essais; essai++) {
            if (essai > 0) {
                await attendre(400 * 3 ** (essai - 1));
            }
            try {
                return await this.une<T>(methode, chemin, corps);
            } catch (e) {
                if (!(e instanceof PismileErreur)) {
                    throw e;
                }
                derniere = e;
                const temporaire = e.code === "reseau" || e.code === "delai_depasse" || TEMPORAIRES.has(e.statut);
                if (!temporaire) {
                    throw e;
                }
            }
        }
        throw derniere ?? new PismileErreur("reseau", "pismile injoignable.");
    }

    private async une<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
        let reponse: Response;
        try {
            reponse = await this.r.fetch(this.r.base + chemin, {
                method: methode,
                headers: {
                    Authorization: this.r.autorisation,
                    Accept: "application/json",
                    ...(corps !== undefined ? { "Content-Type": "application/json" } : {}),
                    "User-Agent": "pismile-node/0.1.0",
                },
                body: corps !== undefined ? JSON.stringify(corps) : undefined,
                signal: AbortSignal.timeout(this.r.delai),
            });
        } catch (e) {
            const delai = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
            throw new PismileErreur(delai ? "delai_depasse" : "reseau",
                delai ? "pismile n'a pas répondu à temps." : "pismile injoignable : " + String((e as Error)?.message ?? e));
        }
        const texte = await reponse.text();
        let donnees: unknown = undefined;
        if (texte) {
            try {
                donnees = JSON.parse(texte);
            } catch {
                throw new PismileErreur("reponse_invalide", `Réponse inattendue (HTTP ${reponse.status}).`, reponse.status);
            }
        }
        if (!reponse.ok) {
            const d = (donnees ?? {}) as { erreur?: string; message?: string };
            throw new PismileErreur(d.erreur ?? `http_${reponse.status}`, d.message ?? `Erreur HTTP ${reponse.status}.`,
                reponse.status);
        }
        return donnees as T;
    }
}

function attendre(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
