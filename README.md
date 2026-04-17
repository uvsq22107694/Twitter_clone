# Twitter_clone

Application cherchant à émuler le site Twitter, créée avec Node.js, Express et SQLite

## Fonctionnalités

- Création de compte utilisateur avec authentification 
- Page d'accueil publique avec scroll infini
- Envoi de messages privés entre utilisateurs

## Structure 

```
.
├── README.md
├── index.html
├── package-lock.json
├── package.json
├── pub
│   ├── client.css
│   └── client.js
├── railway.json
├── schemas.js
└── server.js
```

## API Routes 

### Publiques 
- POST /signin              --- Créer un compte  
- POST /login               --- Se connecter et recevoir un id de session
- GET /messages             --- Récupérer les messages publics

### Utilisateurs 
- POST /logout              --- Se déconnecter  
- POST /messages            --- Publier un message public 
- POST /conversations       --- Commencer une conversation avec un utilisateur
- GET /conversations        --- Récupérer ses conversations
- POST /messages/private    --- Envoyer un message privé
- GET /messages/private     --- Récupérer les messages d'une conversation


