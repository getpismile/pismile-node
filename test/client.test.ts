import { describe, expect, it, vi } from "vitest";
import { Pismile, PismileErreur } from "../src/index.js";

const PAIEMENT = {
    id: "6f1c3b2a-0000-4000-8000-000000000001",
    reference: "cmd-1042",
    sub: "kX9abc",
    montant: 5000,
    devise: "XOF",
    motif: "Boutique X - Commande 1042",
    statut: "EN_ATTENTE",
    compte: "Wave · +228 •••• 12",
    creeLe: "2026-10-25T10:00:00Z",
    expireLe: "2026-10-26T10:00:00Z",
    test: true,
};

function reponse(statut: number, corps?: unknown): Response {
    return new Response(corps === undefined ? null : JSON.stringify(corps), {
        status: statut,
        headers: { "Content-Type": "application/json" },
    });
}

function client(fetch: typeof globalThis.fetch, essais = 2) {
    return new Pismile({ clientId: "psm_test_abc", clientSecret: "pss:secret", issuer: "https://pismile.test/", fetch, essais });
}

describe("paiements.creer", () => {
    it("envoie la demande authentifiée et renvoie le paiement", async () => {
        const fetch = vi.fn(async () => reponse(201, PAIEMENT));
        const p = await client(fetch).paiements.creer({ sub: "kX9abc", montant: 5000, motif: "Commande 1042", reference: "cmd-1042" });

        expect(p.statut).toBe("EN_ATTENTE");
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://pismile.test/api/v1/paiements");
        expect(init.method).toBe("POST");
        const entetes = init.headers as Record<string, string>;
        expect(entetes.Authorization).toBe("Basic " + Buffer.from("psm_test_abc:pss:secret").toString("base64"));
        expect(JSON.parse(init.body as string)).toEqual({ sub: "kX9abc", montant: 5000, motif: "Commande 1042", reference: "cmd-1042" });
    });

    it("transmet le code d'erreur de l'API sans réessayer", async () => {
        const fetch = vi.fn(async () => reponse(403, { erreur: "autorisation_absente", message: "Pas autorisé." }));
        const e = await client(fetch).paiements.creer({ sub: "x", montant: 100, reference: "r1" }).catch((x) => x);

        expect(e).toBeInstanceOf(PismileErreur);
        expect(e.code).toBe("autorisation_absente");
        expect(e.statut).toBe(403);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("réessaie après une erreur serveur temporaire (même référence, sans risque)", async () => {
        const fetch = vi.fn()
            .mockResolvedValueOnce(reponse(503, { erreur: "indisponible", message: "…" }))
            .mockResolvedValueOnce(reponse(200, PAIEMENT));
        const p = await client(fetch, 1).paiements.creer({ sub: "kX9abc", montant: 5000, reference: "cmd-1042" });

        expect(p.id).toBe(PAIEMENT.id);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("signale une coupure réseau après les essais", async () => {
        const fetch = vi.fn(async () => {
            throw new TypeError("fetch failed");
        });
        const e = await client(fetch, 1).paiements.lire("abc").catch((x) => x);

        expect(e.code).toBe("reseau");
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("refuse un montant non entier avant tout appel", async () => {
        const fetch = vi.fn();
        const e = await client(fetch).paiements.creer({ sub: "x", montant: 10.5, reference: "r" }).catch((x) => x);

        expect(e.code).toBe("montant_invalide");
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("paiements.lire", () => {
    it("lit par référence (encodée)", async () => {
        const fetch = vi.fn(async () => reponse(200, PAIEMENT));
        await client(fetch).paiements.lireParReference("cmd:1042 a");

        expect((fetch.mock.calls[0] as unknown as [string])[0])
            .toBe("https://pismile.test/api/v1/paiements?reference=cmd%3A1042%20a");
    });
});

describe("configuration", () => {
    it("exige les identifiants, lus aussi dans PISMILE_CLIENT_ID / PISMILE_CLIENT_SECRET", () => {
        const noms = ["PISMILE_CLIENT_ID", "PISMILE_CLIENT_SECRET", "AUTH_PISMILE_ID", "AUTH_PISMILE_SECRET"];
        const avant = noms.map((n) => process.env[n]);
        noms.forEach((n) => delete process.env[n]);
        try {
            expect(() => new Pismile()).toThrow(PismileErreur);
            process.env.PISMILE_CLIENT_ID = "psm_env";
            process.env.PISMILE_CLIENT_SECRET = "secret_env";
            expect(() => new Pismile()).not.toThrow();
        } finally {
            noms.forEach((n, i) => (avant[i] === undefined ? delete process.env[n] : (process.env[n] = avant[i])));
        }
    });
});

describe("sessions (page de paiement pismile.com)", () => {
    const SESSION = {
        id: "cs_abc", url: "https://pismile.test/payer/cs_abc", reference: "insc-0412", montant: 25000, devise: "XOF",
        motif: "Université - Inscription", statut: "OUVERTE", montantPaye: 0,
        creeLe: "2026-10-25T10:00:00Z", expireLe: "2026-10-25T10:30:00Z", test: true,
    };

    it("crée la page et renvoie son adresse", async () => {
        const fetch = vi.fn(async () => reponse(201, SESSION));
        const s = await client(fetch).sessions.creer({
            montant: 25000, motif: "Inscription", reference: "insc-0412", retour: "https://univ.tg/merci",
        });

        expect(s.url).toBe("https://pismile.test/payer/cs_abc");
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://pismile.test/api/v1/sessions-paiement");
        expect(JSON.parse(init.body as string)).toEqual({
            montant: 25000, motif: "Inscription", reference: "insc-0412", retour: "https://univ.tg/merci",
        });
    });

    it("exige l'adresse de retour", async () => {
        const fetch = vi.fn();
        const e = await client(fetch).sessions.creer({ montant: 100, reference: "r", retour: "" }).catch((x) => x);
        expect(e.code).toBe("requete_invalide");
        expect(fetch).not.toHaveBeenCalled();
    });
});
