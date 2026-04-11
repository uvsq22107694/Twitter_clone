const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const https = require('https');
const path = require('path');
const fs = require('fs');
const argon2 = require('argon2');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir les fichiers statiques depuis pub/
app.use('/pub', express.static(path.join(__dirname, 'pub')));

// La route racine '/' sert l'application client (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Configuration des options de TLS pour HTTPS 
const httpsOptions = {
    key: fs.readFileSync(path.join(__dirname, '..', 'private', 'my-app.key')),
    cert: fs.readFileSync(path.join(__dirname, '..', 'certs', 'my-app.crt')),
};

// Initialisation de la base de données SQLite en mémoire
const db = new sqlite3.Database(':memory:', (err) => {
    if (err) {
        console.error('Erreur SQLite:', err.message);
    } else {
        console.log('Connecté à la base SQLite en mémoire.');
        
        // Table utilisateurs
        db.run(`CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )`);

        // Table messages
        db.run(`CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            author TEXT NOT NULL,
            text TEXT NOT NULL
        )`);
        
        console.log("Tables 'users' et 'messages' initialisées.");
    }
});

const sessions = {};
/* Rajouter un gestionnaire de session : 
 * Retirer les Id de session coté server 
 * Date d'expiration des sessions (Inactif / Absolu)
 */

// --- API JSON ---

// POST /signin : Créer un nouvel utilisateur
app.post('/signin', async (req, res) => {
    const { username, password, passwordConfirmation } = req.body;
    if (!username || !password || !passwordConfirmation) {
        return res.status(400).json({ error: "Username et password requis." });
    }
    if (password != passwordConfirmation) {
        return res.status(422).json({ error: "Les mots de passe ne correspondent pas." });
    }

    try {
        const hashedPassword = await argon2.hash(password);
        
        const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
        db.run(sql, [username, hashedPassword], function(err) {
        if (err) {
            // Utilisateur existe déjà ou autre erreur
            return res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris ou erreur interne." });
        }
        res.status(201).json({ success: true, id: this.lastID, username });
        });
    } catch (err) {
        res.status(500).json({error: "Erreur interne"});
    }
});

// POST /login : Vérifier les identifiants utilisateur
app.post('/login', async (req, res) => {
   
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username et password requis." });
    }

    const sql = "SELECT * FROM users WHERE username = ?";
    db.get(sql, [username], async (err, row) => {
        if (err || !row) {
            return res.status(401).json({ error: "Identifiants invalides." });
        }
    
        try {
            if (await argon2.verify(row.password, password)) {
              //res.json({ success: true, username: row.username });
              // Création d'un identifiant de session
              const sessionId = crypto.randomBytes(32).toString("hex");  
              
              sessions[sessionId] = {
                username: row.username,
                date: Date.now()
              };

              res.json({ success: true, sessionId, username });
            } else {
              return res.status(401).json({ error: "Identifiants invalides." });
            }
        } catch (err) {
            res.status(500).json({error: "Erreur interne"});
        }
    });
});

// GET /messages : Obtenir la liste de tous les messages (ordre chronologique)
app.get('/messages', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const loadAfterLatest = req.query.loadAfterLatest || null;
    
    if (loadAfterLatest) {
        const sql = "SELECT * FROM messages WHERE date > ? ORDER BY date DESC";    
        db.all(sql, [loadAfterLatest], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
            res.json(rows);
        });
    } else {
        const sql = "SELECT * FROM messages ORDER BY date DESC LIMIT ? OFFSET ? ";
        db.all(sql, [limit,offset], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
            res.json(rows);
        });
    }
});

// POST /post : Publier un nouveau message
app.post('/post', (req, res) => {
    const { sessionId, text } = req.body;
    
    if (!sessionId || !sessions[sessionId] ) {
        return res.status(400).json({ error: "Vous devez être connecté pour publier des messages." });
    } else if (!text) {
        return res.status(400).json({ error: "Le message ne peut pas être vide." });
    }

    // Si OK, on insert le message
    const insertSql = "INSERT INTO messages (author, text) VALUES (?, ?)";
    db.run(insertSql, [sessions[sessionId].username, text], function(errPost) {
        if (errPost) {
            return res.status(500).json({ error: errPost.message });
        }
        res.status(201).json({
            success: true,
            id: this.lastID,
            author: sessions[sessionId].username,
            text: text,
            date: new Date().toISOString()
        });
    });
});

// Lancement de l'écoute du serveur https sur PORT
https.createServer(httpsOptions,app).listen(PORT, () => {
    console.log(`Serveur démarré sur https://localhost:${PORT}`);
});