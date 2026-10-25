# Sécurité

Vous pensez avoir trouvé une faille dans ce SDK ou dans l'API pismile ?

- **N'ouvrez pas d'issue publique.**
- Écrivez à **support@pismile.com** avec l'objet « Sécurité », une description et, si possible, les étapes pour reproduire.
- Nous accusons réception sous 72 heures et vous tenons informé jusqu'à la correction.

Rappels pour les intégrateurs :

- le `client_secret` et le secret de webhook (`whsec_…`) restent **sur votre serveur**, jamais dans un navigateur, une
  application mobile ou un dépôt de code ;
- vérifiez **toujours** la signature des webhooks ; ne marquez jamais une commande payée sur la seule page de retour.
