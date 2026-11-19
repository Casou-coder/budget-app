# Mon Budget (iPhone)

Une app de budget qui s'installe sur l'écran d'accueil de l'iPhone. Elle fonctionne **hors ligne**,
sans compte et sans cloud. Vos données restent uniquement sur le téléphone.

## Ce que fait l'app

### 🧠 Mon profil : votre comportement financier
L'app analyse les **3 derniers mois complets**. Elle compare vos revenus à vos dépenses,
classées en **obligatoires** (logement, courses, transport, santé, assurances, téléphone, impôts)
ou en **envies** (restaurants, shopping, loisirs, abonnements, voyages…).

| Profil | Critère (en % des revenus) |
|---|---|
| 🔥 En déficit | dépenses > revenus |
| 🛍️ Dépensier | envies > 35 %, ou épargne < 10 % avec envies > 25 % |
| 🧱 Budget contraint | obligations > 55 % et épargne < 15 % |
| 🐿️ Très conservateur | épargne ≥ 40 % et envies < 15 % |
| 💰 Épargnant | épargne ≥ 25 % |
| ⚖️ Équilibré | épargne entre 10 et 25 % |
| 🎯 Sur le fil | épargne < 10 %, envies modérées |

Ce profil est complété par des **traits** détectés dans vos catégories : épicurien, acheteur compulsif,
multi-abonné, petits achats fréquents, dépensier du week-end, investisseur, épargne dormante, logement lourd.
L'app calcule aussi un **score de santé financière sur 100** : 45 points pour l'épargne, 30 pour la maîtrise
des envies, 25 pour le poids des obligations.

### 📅 Au quotidien
- **« Aujourd'hui, vous pouvez dépenser X € »**. Le calcul part de vos revenus, retire les obligations
  attendues et votre objectif d'épargne, puis enlève les envies déjà dépensées. Le reste est divisé
  par le nombre de jours restants dans le mois.
- **Priorités** : la liste des envies à réduire en premier, avec l'économie possible pour chacune.
- **Hors obligatoire** : vos plus gros marchands « envie ».
- **Dépenses récurrentes** : vos abonnements et prélèvements sont détectés automatiquement.
- **Conseils personnalisés**, et un bouton pour appliquer d'un coup les **budgets recommandés**.

### Le reste
Budgets par catégorie, historique sur 6 mois, patrimoine (comptes, portefeuille, autres actifs),
code de verrouillage, sauvegarde au format JSON.

## Connecter ses banques

### Automatique : Enable Banking (DSP2)
[Enable Banking](https://enablebanking.com) est un agrégateur agréé qui utilise les API bancaires
européennes officielles (DSP2). Il couvre le **CIC**, le **compte espèces Trade Republic**
et plus de 2 500 autres banques. L'accès se fait en **lecture seule** et c'est **gratuit pour vos propres comptes**.

- C'est votre iPhone qui signe lui-même ses requêtes. La clé de signature (une clé RSA) reste sur le téléphone.
- Vous vous identifiez dans l'app ou sur le site de votre banque (authentification forte habituelle).
- Votre accord (le « consentement ») dure 180 jours. L'app vous prévient avant qu'il expire.
- Les comptes se synchronisent automatiquement toutes les 6 h quand vous ouvrez l'app.

**Configuration** (une seule fois, environ 5 minutes) : allez dans l'onglet **Import › Paramètres de l'API**
et suivez les étapes indiquées.

> Si Safari affiche une erreur « Réseau ou CORS bloqué », déployez le petit relais
> [`tools/cors-relay-worker.js`](tools/cors-relay-worker.js) sur Cloudflare (gratuit), puis indiquez son adresse
> dans *Adresse de l'API*. Ce relais ne stocke rien.

### Positions Trade Republic (actions, ETF)
La DSP2 ne couvre que le compte espèces. Pour valoriser vos titres, importez le CSV généré par `pytr`
(voir [`tools/README.md`](tools/README.md)), ou saisissez la valeur du portefeuille à la main.

### Import de fichiers
CSV ou OFX du CIC (*Comptes › Télécharger vos opérations*), et tout autre CSV bancaire.
Les doublons sont ignorés. Pour un même compte, choisissez **une seule** méthode : fichiers **ou** API.

## Installer sur l'iPhone

1. Sur GitHub, ouvrez le dépôt › **Settings › Pages** › Source : **GitHub Actions**.
   À chaque mise à jour, le workflow `.github/workflows/pages.yml` publie l'app. Le dépôt doit être public,
   ou votre compte GitHub doit être Pro, car Pages n'est pas disponible gratuitement pour un dépôt privé.
   Seul le **code** est publié. Vos données ne quittent jamais le téléphone.
2. Dans **Safari**, ouvrez `https://casou-coder.github.io/budget-app/`.
3. Touchez le bouton **Partager**, puis **Sur l'écran d'accueil**.
4. Ouvrez l'app depuis l'écran d'accueil.

> ⚠️ Utilisez toujours l'icône de l'écran d'accueil. Sur iPhone, Safari et l'app installée ont des
> stockages séparés. Si la banque vous renvoie vers Safari après la connexion, l'app affiche un code :
> copiez-le, puis collez-le dans l'app (*Import › Coller un code de retour*).
>
> Exportez une sauvegarde régulièrement (*Réglages › Exporter*).

## Tester

Le dossier `exemples/` contient des relevés fictifs, dont `cic-4-mois.csv` qui permet d'obtenir un profil complet.

## Partager l'app avec des proches

L'app est conçue pour plusieurs utilisateurs : rien de personnel n'est écrit dans le code, et chaque
personne a ses propres données, sur son propre téléphone.

- **Import de fichiers, budget, profil, change de devises** : il suffit d'ouvrir le lien de l'app et de
  l'ajouter à l'écran d'accueil.
- **Connexion bancaire automatique** : en mode « restreint » (gratuit), une application Enable Banking
  ne donne accès qu'aux comptes que son propriétaire a liés. Chaque personne crée donc **sa propre
  application Enable Banking** (Application ID + clé .pem) et la saisit dans *Import › Paramètres de l'API*.
  Pour ouvrir la connexion à tous sans cette étape, il faudrait passer l'application en production
  complète chez Enable Banking (contrat, et sans doute payant).
- **Relais Cloudflare** : un même relais peut servir à tous les utilisateurs de l'app, car il ne fait que
  transmettre les requêtes signées par chaque téléphone.
- **Change de devises** : Telexoo, Revolut, Wise, Swissquote, etc. sont reconnus. Pour ajouter un autre
  service, il suffit d'ajouter une règle « Change de devises » dans *Réglages › Règles*.
