# Récupérer ses données Trade Republic avec pytr

Trade Republic ne propose **pas d'API officielle**. [pytr](https://github.com/pytr-org/pytr) est un outil
open source qui utilise la même connexion que l'application mobile (numéro + code PIN + code reçu par SMS/app).
Il tourne **sur votre machine** : vos identifiants ne passent que par les serveurs de Trade Republic.

> ⚠️ Outil non officiel : l'API peut changer sans préavis. Lisez le code si vous voulez être sûr de ce qu'il fait.

## Sur PC (Windows / macOS / Linux)

```bash
pip install pytr
pytr login                                  # numéro, PIN, puis code de confirmation
pytr export_transactions                    # → crée un CSV des opérations
pytr portfolio -o portfolio.csv             # → positions et valeur actuelle
```

Transférez ensuite les CSV sur le téléphone et importez-les dans l'onglet **Import** de l'app,
dans le compte « Trade Republic » (type *Placements*).

## Directement sur Android (Termux)

1. Installez [Termux](https://f-droid.org/packages/com.termux/) depuis F-Droid.
2. Dans Termux :
   ```bash
   pkg install python
   pip install pytr
   termux-setup-storage                     # donne accès au dossier Téléchargements
   cd ~/storage/downloads
   pytr login
   pytr export_transactions
   pytr portfolio -o portfolio.csv
   ```
3. Dans l'app : **Import** › compte Trade Republic › choisir les fichiers dans *Téléchargements*.

Les noms d'options de pytr peuvent varier selon la version : `pytr --help` et `pytr export_transactions --help`
donnent la liste exacte.

## CIC

Le CIC ne fournit pas d'API aux particuliers (l'accès DSP2 est réservé aux agrégateurs agréés).
Le plus fiable et 100 % local : **export CSV ou OFX** depuis cic.fr
(*Comptes › Télécharger vos opérations*), puis import dans l'app. Le format CSV du CIC
(`Date d'opération;Date de valeur;Débit;Crédit;Libellé;Solde`, encodage Windows-1252) est reconnu
automatiquement, ainsi que l'OFX/QFX (Money/Quicken).
