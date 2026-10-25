import { createHmac, timingSafeEqual } from "node:crypto";
import { PismileErreur } from "./erreurs.js";
import type { EvenementWebhook } from "./types.js";

/** Nom de l'en-tête de signature (en minuscules dans `req.headers` avec Node). */
export const ENTETE_SIGNATURE = "pismile-signature";

export interface OptionsVerification {
    /** Écart maximal accepté entre l'horodatage signé et maintenant, en secondes. Défaut : 300. */
    tolerance?: number;
    /** Maintenant, en secondes Unix (tests). */
    maintenant?: number;
}

/**
 * Vérifie un webhook pismile et renvoie son contenu.
 *
 * @param corpsBrut le corps **brut** de la requête, tel que reçu (pas l'objet déjà analysé par `express.json()`)
 * @param entete    la valeur de l'en-tête `Pismile-Signature` (`t=…,v1=…`)
 * @param secret    le secret du webhook (`whsec_…`), affiché une fois dans la console
 * @throws PismileErreur `signature_invalide` ou `signature_expiree` : répondez 400 et ignorez le message
 */
export function verifierWebhook(
    corpsBrut: string | Uint8Array,
    entete: string | string[] | null | undefined,
    secret: string,
    options: OptionsVerification = {},
): EvenementWebhook {
    if (!secret) {
        throw new PismileErreur("configuration", "Secret du webhook manquant (PISMILE_WEBHOOK_SECRET).");
    }
    const valeur = Array.isArray(entete) ? entete[0] : entete;
    if (!valeur) {
        throw new PismileErreur("signature_invalide", "En-tête Pismile-Signature absent.");
    }
    const parties = new Map<string, string>();
    for (const morceau of valeur.split(",")) {
        const i = morceau.indexOf("=");
        if (i > 0) {
            parties.set(morceau.slice(0, i).trim(), morceau.slice(i + 1).trim());
        }
    }
    const t = parties.get("t");
    const v1 = parties.get("v1");
    if (!t || !v1 || !/^\d+$/.test(t) || !/^[0-9a-f]{64}$/.test(v1)) {
        throw new PismileErreur("signature_invalide", "En-tête Pismile-Signature illisible.");
    }
    const corps = typeof corpsBrut === "string" ? corpsBrut : Buffer.from(corpsBrut).toString("utf8");
    const attendu = createHmac("sha256", secret).update(`${t}.${corps}`, "utf8").digest();
    const recu = Buffer.from(v1, "hex");
    if (recu.length !== attendu.length || !timingSafeEqual(recu, attendu)) {
        throw new PismileErreur("signature_invalide", "Signature incorrecte : mauvais secret ou corps modifié.");
    }
    const tolerance = options.tolerance ?? 300;
    const maintenant = options.maintenant ?? Math.floor(Date.now() / 1000);
    if (Math.abs(maintenant - Number(t)) > tolerance) {
        throw new PismileErreur("signature_expiree", "Webhook trop ancien (rejeu ?).");
    }
    try {
        return JSON.parse(corps) as EvenementWebhook;
    } catch {
        throw new PismileErreur("signature_invalide", "Corps JSON illisible.");
    }
}

/** Signe un corps comme pismile (pour vos tests). */
export function signerWebhook(corps: string, secret: string, horodatage = Math.floor(Date.now() / 1000)): string {
    const v1 = createHmac("sha256", secret).update(`${horodatage}.${corps}`, "utf8").digest("hex");
    return `t=${horodatage},v1=${v1}`;
}
