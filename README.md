# Coup d'envoi — kit de départ jeu de foot 3D

Jeu de foot 3D dans le navigateur (ordinateur et téléphone), construit pour servir de **base réutilisable** :
menu, carte, personnage animé, physique solide, ballon et gardien.

## Mettre en ligne sur GitHub

1. Crée un dépôt vide (par exemple `game-starter-kit`).
2. Dézippe l'archive, puis **Add file → Upload files** et glisse tout le contenu (dossiers compris).
3. **Settings → Pages → Branch : main / root → Save**. Le jeu est jouable à l'adresse donnée après une minute.

> Ouvrir `index.html` en double-cliquant ne marche pas (le navigateur bloque les modules).
> Il faut GitHub Pages, ou en local : `npx serve .` puis ouvrir l'adresse affichée.

## Commandes

| Clavier | Téléphone | Action |
|---|---|---|
| ZQSD / flèches | joystick | courir |
| Maj | Sprint | sprinter |
| Espace (maintenir puis relâcher) | Tir | tirer, plus c'est chargé plus c'est fort et haut |
| Échap | bouton II | pause |

## Structure

```
index.html          menus, HUD, versions des librairies (importmap)
css/style.css       look des menus et des boutons tactiles
assets/models/      modèles 3D .glb (stockés dans le dépôt, jamais de lien externe cassé)
src/config.js       TOUS les réglages : vitesses, puissance de tir, taille du terrain, durée…
src/main.js         boucle de jeu, états (menu, match, pause, but, fin), caméra
src/physics.js      monde physique Rapier à pas fixe (même résultat à 30 ou 144 FPS)
src/field.js        terrain, cages, murs invisibles, détection des buts
src/ball.js         ballon
src/characters.js   joueur (dribble, tir chargé) et gardien (IA simple)
src/input.js        clavier + tactile
src/assets.js       chargement des modèles, avec une forme de secours si un modèle manque
src/ui.js           affichage des écrans et du score
```

## Pourquoi la physique ne bugge pas

- **Rapier** (vrai moteur physique) au lieu de collisions codées à la main.
- **Pas de temps fixe** : la simulation ne dépend pas de la vitesse de l'appareil.
- **Character controller** : le joueur glisse le long des murs au lieu de trembler ou traverser.
- **Groupes de collision** : le joueur ne trébuche pas sur le ballon, il le dribble.
- **CCD sur le ballon** : un tir très fort ne traverse pas les poteaux.
- Tir et dribble règlent la **vitesse** du ballon, pas une force : le résultat ne change pas si on modifie sa masse.

## Changer le personnage

Le modèle actuel est `Soldier.glb` (exemples officiels de three.js, animations Idle / Walk / Run).
Pour un footballeur : un personnage gratuit de [Mixamo](https://www.mixamo.com) ou
[Quaternius](https://quaternius.com) exporté en `.glb` avec des animations nommées `Idle`, `Walk`, `Run`.
Le mettre dans `assets/models/`, changer le chemin dans `src/assets.js`.
S'il court à reculons : `modelYawOffset: 0` dans `src/config.js`.

## Idées pour la suite

Coéquipiers et adversaires, passes, tirs au but, sons, choix des équipes, mode GTA (voiture) avec la même base.

## Consignes pour Claude (à coller dans les instructions du Projet)

```
On part toujours du kit "Coup d'envoi" (repo GitHub). Garde sa structure :
réglages dans config.js, physique Rapier 0.14 à pas fixe, three.js 0.160 via importmap,
modèles .glb dans assets/models avec forme de secours. Code et commentaires en anglais,
textes du jeu en français. Le jeu doit marcher au clavier et au tactile.
```

## Crédits

three.js (MIT), Rapier (Apache-2.0), modèle Soldier issu des exemples three.js.

---

# City Starter Kit (3D, Vite + React) — dossier `city-kit/`

Deuxième kit, base pour un jeu de ville ouverte type GTA : personnage animé (ecctrl), combat,
armes, voitures, moto, hélicoptère, ville générée, terrain d'essai, piétons, jour/nuit,
téléphone, roue des armes, contrôles tactiles. Voir [`city-kit/README.md`](city-kit/README.md).

Publication : le workflow `.github/workflows/pages-preview.yml` publie sur la branche `gh-pages`
(Settings → Pages → « Deploy from a branch » → `gh-pages` / root) :
- `main` → `https://<user>.github.io/<repo>/` (foot) et `.../city/` (ville)
- autre branche → `https://<user>.github.io/<repo>/preview/<branche>/city/`
