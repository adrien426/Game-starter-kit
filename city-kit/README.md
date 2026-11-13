# City Starter Kit — jeu 3D à la troisième personne

Kit de base pour faire un jeu de ville ouverte (type GTA) dans le navigateur :
**Vite + React + Three.js (@react-three/fiber) + @react-three/rapier + ecctrl 2**.

Un bonhomme qui marche, court, saute, frappe, donne des coups de pied, vise et tire ;
des voitures, une moto et un hélicoptère qu'on peut conduire ; une ville générée, un
terrain d'essai (plateformes, rampes, escaliers, ascenseur), des piétons, jour/nuit,
mini-carte, HUD, clavier + tactile. Tout se règle dans **un seul fichier** : `src/config.js`.

## Démarrer

```bash
cd city-kit
npm install
npm run dev        # http://localhost:5173
npm run build      # site statique dans dist/ (base: './', marche dans n'importe quel sous-dossier)
npm run preview    # teste le build
```

Options d'URL : `?quality=low` (sans ombres ni post-traitement, pour PC faibles),
`?debug` (affiche les colliders Rapier).

### GitHub Pages

Le workflow `.github/workflows/pages.yml` (à la racine du dépôt) compile le kit et publie :
- `https://<user>.github.io/<repo>/` → le jeu de foot (racine du dépôt)
- `https://<user>.github.io/<repo>/city/` → ce kit

Réglage à faire une fois : **Settings → Pages → Source : GitHub Actions**.

## Commandes

| Clavier / souris | Action |
|---|---|
| ZQSD (AZERTY) ou WASD (QWERTY) | se déplacer / conduire (touches physiques, les deux claviers marchent) |
| Maj | courir |
| Espace | sauter / frein à main |
| Clic gauche | frapper (poings) / tirer |
| Clic droit | viser (caméra par-dessus l'épaule) |
| C | coup de pied |
| V | roulade (en courant) / esquive |
| B | emote : salut, provocation, danse, victoire |
| 1 2 3, X | changer d'arme |
| R | recharger |
| F | monter / descendre d'un véhicule |
| Hélicoptère | Espace monter, Maj descendre, Z/S avancer-reculer, Q/D tourner, flèches glisser |
| H | klaxon |
| N | jour / nuit |
| Molette | zoom caméra |
| Échap | pause |

Téléphone : joystick à gauche, boutons à droite, glisser sur l'écran pour tourner la caméra.

## Structure

```
city-kit/
  vite.config.js            base: './' pour GitHub Pages
  scripts/build-player.mjs  fusionne personnages + animations Mixamo (voir plus bas)
  source/                   fichiers bruts (Google Drive) utilisés par le script
  public/models/
    characters/             james.glb (joueur), adam / pnj_*.glb (piétons), animations.glb
    vehicles/               kia, nsx, volvo (voitures), h2r (moto), heli (hélicoptère)
    weapons/ props/         armes, arbres
  public/textures/          asphalte, pavés, herbe, béton
  src/
    config.js               TOUS les réglages : joueur, caméra, armes, véhicules, ville, PNJ
    App.jsx                 assemble la scène (Canvas, Physics, monde, joueur, véhicules, HUD)
    core/
      input.js              clavier + souris + tactile → "actions" (BINDINGS = touches)
      FollowCamera.jsx      caméra 3e personne : orbite, zoom, visée, anti-murs, suit les véhicules
      store.js              état du jeu (zustand) : vie, argent, arme, munitions, véhicule…
      runtime.js            état partagé lu à chaque image (positions, véhicules, cibles)
      audio.js              sons synthétisés (tir, coups, moteur, klaxon)
      physicsGuard.js       filet de sécurité anti-NaN pour Rapier
    player/
      Player.jsx            le personnage : ecctrl + animations + armes + coups + monter en véhicule
      character.js          chargement d'un perso Mixamo + animations partagées + visée procédurale
    vehicles/Vehicles.jsx   voitures / moto (ecctrl ShapeCastWheel) et hélico (ecctrl ThrustPropeller)
    combat/                 tirs (raycast), coups (zone), effets (traçantes, étincelles, flash)
    npc/Pedestrians.jsx     piétons : marchent, fuient, tombent, réapparaissent
    world/                  ville générée, terrain d'essai, éclairage (ciel, soleil, ombres, nuit)
    ui/HUD.jsx              menu, pause, vie, argent, arme, vitesse, mini-carte, boutons tactiles
```

## Personnage et animations (Google Drive)

- Personnage joueur : **James** (`james.glb`, squelette Mixamo), piétons : Adam, agent, femme, soldat.
  Ces modèles viennent du dossier Drive « 3D » (déjà convertis pour le projet GTA5).
- **44 animations Mixamo du Drive** dans une seule bibliothèque `animations.glb` (1 Mo) :
  - déplacement : `Idle`, `Walk`, `Jog`, `Running`, `Sprint`, `JogBack`, `StrafeLeft/Right`,
    `WalkStrafeLeft`, `SteppingBackward`, `Strafing`
  - air : `Jump`, `Falling`, `JumpDown`, `FallingToRoll`, `RunToRolling`, `DodgingRight`
  - combat : `Boxing` (garde), `LeadJab`, `JabCross`, `MmaKick`, `Kick`, `Tackle`, `BodyBlock`,
    `FightIdle`
  - dégâts : `HeadHit`, `BigKidneyHit`, `TakingPunch`, `Dying`, `FallFlat`, `Dive`, `StandingUp`
  - armes : `RifleAimingIdle`, `FiringRifle`
  - divers : `SeatedIdle` (conducteur), `ClimbingLadder`, `Swimming`, `Salute`, `Taunt`,
    `HipHopDancing`, `Victory`, `Defeat`, `SittingClap`, `Header`
- `npm run build:player` : lit `source/animations/*.gltf` et `source/animations-fbx/*.fbx`
  (FBX Mixamo convertis par le FBXLoader de three.js), renomme les os (`mixamorig9:Hips` → `Hips`)
  pour qu'**un seul fichier d'animations serve à tous les personnages Mixamo**, rend les clips
  « sur place », normalise la hauteur des hanches (cm ou m) et compresse.
- La visée est un calque procédural (`aimBoneAt` dans `character.js`) : les bras suivent le
  viseur par-dessus le clip en cours (idle, course, strafe…).
- **Ajouter une animation** : la mettre dans `source/animations-fbx/` (FBX Mixamo « without skin »)
  ou `source/animations/` (glTF), relancer `npm run build:player`, puis
  `animator.play('NomDuFichier')`. Le Drive en contient une centaine d'autres
  (escalade, échelle, nage, accroupi, danses, assis…) prêtes à ajouter de la même façon.

### Changer de personnage

Mettre un `.glb` Mixamo dans `source/characters/`, lancer `npm run build:player`, puis
`player.model` dans `src/config.js`.

## Ajouter…

- **un véhicule** : le `.glb` dans `public/models/vehicles/` (nœuds `body` et `wheel`, avant = +Z),
  une entrée dans `VEHICLE_TYPES` (taille, rayon et position des roues, puissance) et une
  ligne dans `VEHICLE_SPAWNS`. Moto : nœuds `wheelF` / `wheelR`, `kind: 'bike'`.
- **une arme** : une ligne dans `WEAPONS` (dégâts, cadence, chargeur, dispersion, modèle).
- **un objet qui prend des dégâts** : `runtime.damageables.set(collider.handle, { hit(damage, point, dir, source) {} })`.
- **une touche** : `BINDINGS` dans `src/core/input.js`, puis `input.pressed('nom')` / `input.held('nom')`.
- **un quartier** : `SPECIAL` dans `src/world/cityLayout.js` (plaza, test, park, ou un nouveau type).

## Notes techniques (pourquoi c'est fait comme ça)

- **ecctrl 2** fournit le contrôleur de personnage (capsule flottante, pentes, plateformes
  mobiles), les voitures (roues ShapeCast avec vrai couple moteur et adhérence) et le vol
  stabilisé (utilisé pour l'hélicoptère). Il ne lit pas le clavier : on lui envoie
  `setMovement(...)` depuis `input.js`, ce qui permet de brancher clavier, tactile ou IA.
- **Un pas de physique par image** (`<Physics paused>` + `TimeControl`) : ecctrl applique ses
  forces une fois par image ; plusieurs pas fixes par image feraient s'enfoncer les voitures
  sous 60 FPS. En dessous de 30 FPS le jeu ralentit au lieu de devenir instable.
- **Roues montées 2 images après le châssis** (`useModulesReady`) : sinon, au premier frame,
  ecctrl divise par une gravité nulle et la roue garde une vitesse NaN (voiture bloquée).
- **Dans un callback de requête Rapier, ne lire que `collider.handle`** : appeler une autre
  méthode Rapier à l'intérieur fait planter le WASM.
- La moto est maintenue debout par un couple correcteur (ecctrl n'a pas encore de mode deux roues)
  et s'incline visuellement dans les virages.
- Les piétons ont un collider « capteur » : les voitures ne rebondissent pas dessus ;
  balles et coups les trouvent via `runtime.damageables`.

## Idées pour la suite (projet GTA)

Police et étoiles de recherche, IA de circulation, missions, sauvegarde, multijoueur
(voir le dépôt GTA5), conducteur visible assis, ragdoll, sons réels.

## Crédits

three.js, React Three Fiber, drei, Rapier, ecctrl (MIT / Apache-2.0).
Modèles : dossier Google Drive « 3D » de l'auteur (personnages et animations Mixamo,
véhicules, armes, arbres) — mêmes fichiers que le projet GTA5.
