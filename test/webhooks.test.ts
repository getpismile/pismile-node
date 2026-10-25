import { describe, expect, it } from "vitest";
import { Pismile, signerWebhook, verifierWebhook } from "../src/index.js";

const SECRET = "whsec_test";
const CORPS = JSON.stringify({
    id: "evt_1",
    type: "paiement.paye",
    creeLe: "2026-10-25T10:00:00Z",
    test: false,
    donnees: { id: "p1", sub: "kX9", montant: 5000, devise: "XOF", statut: "PAYE", creeLe: "", expireLe: "", test: false },
});

describe("verifierWebhook", () => {
    it("accepte la signature calculée par le serveur pismile (même algorithme que le serveur Java)", () => {
        // Valeur produite par SignatureWebhook.entete("whsec_test", 1700000000, "{\"id\":\"evt_1\"}") côté serveur.
        const entete = "t=1700000000,v1=c89214b5b5da833daed6f0b8c5bb6bd58cea9022bd80ccc78230f3942d632925";
        const evt = verifierWebhook('{"id":"evt_1"}', entete, SECRET, { maintenant: 1700000010 });
        expect(evt.id).toBe("evt_1");
    });

    it("renvoie l'événement typé", () => {
        const evt = verifierWebhook(CORPS, signerWebhook(CORPS, SECRET), SECRET);
        expect(evt.type).toBe("paiement.paye");
        if (evt.type !== "test") {
            expect(evt.donnees.montant).toBe(5000);
        }
    });

    it("accepte un corps Buffer et un en-tête tableau", () => {
        const entete = signerWebhook(CORPS, SECRET);
        expect(verifierWebhook(Buffer.from(CORPS), [entete], SECRET).id).toBe("evt_1");
    });

    it("refuse un mauvais secret", () => {
        expect(() => verifierWebhook(CORPS, signerWebhook(CORPS, "whsec_autre"), SECRET))
            .toThrow(expect.objectContaining({ code: "signature_invalide" }));
    });

    it("refuse un corps modifié", () => {
        const entete = signerWebhook(CORPS, SECRET);
        expect(() => verifierWebhook(CORPS.replace("5000", "50"), entete, SECRET))
            .toThrow(expect.objectContaining({ code: "signature_invalide" }));
    });

    it("refuse un webhook trop ancien (rejeu)", () => {
        const entete = signerWebhook(CORPS, SECRET, 1_000);
        expect(() => verifierWebhook(CORPS, entete, SECRET, { maintenant: 1_000 + 301 }))
            .toThrow(expect.objectContaining({ code: "signature_expiree" }));
    });

    it("refuse un en-tête absent ou illisible", () => {
        expect(() => verifierWebhook(CORPS, undefined, SECRET)).toThrow(expect.objectContaining({ code: "signature_invalide" }));
        expect(() => verifierWebhook(CORPS, "n'importe quoi", SECRET)).toThrow(expect.objectContaining({ code: "signature_invalide" }));
    });

    it("passe par le client avec le secret configuré", () => {
        const pismile = new Pismile({ clientId: "a", clientSecret: "b", webhookSecret: SECRET });
        expect(pismile.webhooks.verifier(CORPS, signerWebhook(CORPS, SECRET)).id).toBe("evt_1");
    });
});
