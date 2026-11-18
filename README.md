# Mon Budget — 100 % local

Application de budget installable sur téléphone (PWA), **sans serveur, sans compte, sans cloud**.
Toutes les données restent dans le stockage du navigateur de votre téléphone.

## Fonctions

- **Budget mensuel** : revenus, dépenses, reste à vivre, taux d'épargne, montant placé.
- **Dépenses par catégorie** avec catégorisation automatique (règles par mots-clés, modifiables).
  Toucher une opération permet de la reclasser et de créer une règle pour les suivantes.
- **Budgets par catégorie** avec barre de progression et dépassement.
- **Historique 6 mois** revenus/dépenses.
- **Patrimoine** : comptes courants, épargne, placements (positions Trade Republic), autres actifs
  (immobilier, crypto…), courbe d'évolution mensuelle.
- **Import** CSV CIC, OFX/QFX, CSV Trade Republic (via pytr), CSV générique. Doublons ignorés.
- **Code de verrouillage**, **sauvegarde/restauration JSON**, fonctionne **hors ligne**.

## Connexion aux banques : ce qui est possible

| Source | Méthode | Pourquoi |
|---|---|---|
| CIC | Export CSV/OFX depuis cic.fr → import | Pas d'API particulier ; l'accès DSP2 est réservé aux agrégateurs agréés (et passerait par leurs serveurs). |
| Trade Republic | Outil `pytr` (local) → import CSV | Pas d'API officielle ; pytr utilise la connexion de l'appli. Voir [`tools/README.md`](tools/README.md). |

Une connexion automatique directe depuis le navigateur du téléphone n'est pas possible
(CORS, authentification forte de la banque). L'import de fichiers garde tout en local.

## Installer sur le téléphone

**Option A — Android, totalement local (Termux)**
```bash
pkg install git python
git clone https://github.com/Casou-coder/budget-app && cd budget-app
python -m http.server 8080
```
Ouvrez `http://localhost:8080` dans Chrome › menu ⋮ › *Ajouter à l'écran d'accueil*.
Une fois installée, l'app fonctionne hors ligne (Termux n'est plus nécessaire pour l'ouvrir).

**Option B — Depuis un PC du même Wi-Fi**
Lancez `python -m http.server 8080` dans le dossier, puis ouvrez `http://<ip-du-pc>:8080` sur le téléphone.
(Sur HTTP non-localhost, le mode hors ligne et l'installation complète ne sont pas disponibles.)

**Option C — GitHub Pages (iPhone et Android)**
Activez Pages sur le dépôt, ouvrez l'URL une fois puis *Partager › Sur l'écran d'accueil* (Safari) ou
*Installer l'application* (Chrome). Seul le **code** est hébergé : vos données ne quittent jamais le téléphone.

## Tester

Le dossier `exemples/` contient des fichiers CIC et Trade Republic fictifs pour essayer l'import.

> Pensez à exporter une sauvegarde régulièrement (Réglages › Exporter) : effacer les données du navigateur
> efface aussi le budget.
