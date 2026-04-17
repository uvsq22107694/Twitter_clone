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

// In-memory session store
const sessions = {};

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

        // Table conversations
        db.run(`CREATE TABLE conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user1 TEXT NOT NULL,
            user2 TEXT NOT NULL,
            lastMessage TEXT,
            lastMessageAt INTEGER,
            UNIQUE(user1, user2) 
        )`);

        // Table pvMessages
        db.run(`CREATE TABLE pvMessages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversationId INTEGER NOT NULL,
            author TEXT NOT NULL,
            text TEXT NOT NULL,
            date INTEGER NOT NULL,
            read INTEGER DEFAULT 0,
            FOREIGN KEY (conversationId) REFERENCES conversations(id)
        )`);

        console.log("Tables 'users', 'messages' et 'conversations' initialisées.");
    }
});

// Gestionnaire de sessions
const sessions = {};

// Middleware pour gérer les sessions des utilisateurs
const authenticate =  (req, res, next) => {
    const sessionId = req.headers['sessionid'];

    // Vérifie si la session existe 
    if(!sessionId || !sessions[sessionId]){
        return res.status(400).json({error: "Vous n'êtes pas connéctés."});
    }
    // Retire la session si elle est expiré 
    const HOUR = 3600000 ;
    if( Date.now() - sessions[sessionId].date > HOUR) {
        delete sessions[sessionId];
        return res.status(400).json({error: "Vôtre session à expiré."});
    }

    // Transmet les informations de l'utilisateur
    req.user = sessions[sessionId];
    next();
}

// --- API JSON ---

app.post('/logout', authenticate, (req, res) => {
    delete sessions[req.headers['sessionid']];
    res.json({ success: true });
});

// POST /signin : Créer un nouvel utilisateur
app.post('/signin', async (req, res) => {
    // Vérification des identifiants
    const { username, password, passwordConfirmation } = req.body;
    if (!username || !password || !passwordConfirmation) {
        return res.status(400).json({ error: "Username et password requis." });
    }
    if (password != passwordConfirmation) {
        return res.status(422).json({ error: "Les mots de passe ne correspondent pas." });
    }

    try {
        // Hashage du mot de passe
        const hashedPassword = await argon2.hash(password);
        const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
        db.run(sql, [username, hashedPassword], function(err) {
            // Utilisateur existe déjà ou autre erreur
            if (err) return res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris ou erreur interne." });
        
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

    // Recherche de l'utilisateur d'après ses identifiants
    const sql = "SELECT * FROM users WHERE username = ?";
    db.get(sql, [username], async (err, row) => {
        if (err || !row) return res.status(401).json({ error: "Identifiants invalides." });
        
        try {
            // Verification du mdp haché
            if (await argon2.verify(row.password, password)) {
                
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
    
    // Récupérer les messages les plus récents
    if (loadAfterLatest) {
        const sql = "SELECT * FROM messages WHERE date > ? ORDER BY date DESC";    
        db.all(sql, [loadAfterLatest], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erreur interne" });
        
            res.json(rows);
        });
    } else { // Récupérer les premier message en partant d'un offset
        const sql = "SELECT * FROM messages ORDER BY date DESC LIMIT ? OFFSET ? ";
        db.all(sql, [limit,offset], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erreur interne" });
            res.json(rows);
        });
    }
});

// POST /post : Publier un nouveau message
app.post('/post', authenticate, (req, res) => {
    const username  = req.user.username;
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: "Le message ne peut pas être vide." });
    }

    // Insérer le messgae dans la base de données
    const insertSql = "INSERT INTO messages (author, text) VALUES (?, ?)";
    db.run(insertSql, [username, text], function(errPost) {
        if (errPost) return res.status(500).json({ error: "Erreur interne" });
        
        res.status(201).json({
            success: true,
            id: this.lastID,
            author: username,
            text: text,
            date: new Date().toISOString()
        });
    });
});

// GET /conversations : Obtenir la liste de toutes les conversations pour un utilisateur
app.get('/conversations', authenticate, (req, res) => {
    const username = req.user.username;

    // Liste de toutes les conversations auquelles un utilisateur a participé
    const sql = "SELECT * FROM conversations WHERE user1 = ? OR user2 = ? ORDER BY lastMessageAt DESC";    
    db.all(sql, [username,username], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erreur interne" });
        
        return res.json(rows);
    });
});

// POST /conversations : Commencer une conversation avec un utilisateur 
app.post('/conversations', authenticate, (req, res) => {
    const username = req.user.username;
    const { recipient } = req.body;

    if (!recipient) {
        return res.status(400).json({ error: "Destinataire requis." });
    } else if (recipient === username) {
        return res.status(400).json({ error: "Vous ne pouvez pas vous écrire à vous-même." });
    }

    // Verifier que l'utilisateur existe
    const verifySql ="SELECT * FROM users WHERE username = ?";
    db.get(verifySql, [recipient], (err,row) => {
        if (err || !row) return res.status(500).json({ error: "Cet utilisateur n'éxiste pas." });
    
        // Respect de la contrainte d'unicité de la table conversations
        const [user1, user2] = [username, recipient].sort();

        // Insérer la nouvelle convo
        const insertSql = `INSERT OR IGNORE INTO conversations (user1, user2, lastMessage, lastMessageAt) VALUES (?, ?, ?, ?)`;
        db.run(insertSql, [user1, user2, null, Date.now()], (err) => {
                if (err) return res.status(500).json({ error: "Erreur interne." });

                // Renvoyer l'identifiant de la conversation'
                const sql = `SELECT * FROM conversations WHERE user1 = ? AND user2 = ?`;
                db.get( sql, [user1, user2], (err, conversation) => {
                        if (err) return res.status(500).json({ error: "Erreur interne." });
                        res.status(201).json({ 
                            success: true,
                            conversationId: conversation.id });
                    }
                );
            }
        );
    });
});

// GET /messages/private : Obtenir la liste des messages pour une conversation donnée
app.get('/messages/private', authenticate, (req, res) => {
        const username = req.user.username;
        const { conversationId } = req.query;

    if (!conversationId) {
        return res.status(400).json({ error: "conversationId requis." });
    }

    // Vérifier si l'utilisateur à participé à la conversation
    const verifySql = `SELECT * FROM conversations WHERE id = ? AND (user1 = ? OR user2 = ?)`;
    db.get(verifySql, [conversationId, username, username], (err, conversation) => {
            if (err || !conversation) return res.status(403).json({ error: "Accès refusé." });
            
            // Si OK, on récupère les messages
            const sql = `SELECT * FROM pvMessages WHERE conversationId = ? ORDER BY date ASC`;
            db.all( sql, [conversationId], (err, rows) => {
                    if (err) return res.status(500).json({ error: "Erreur interne." });
                    res.json(rows);
                }
            );
        }
    );
});

// POST /messages/private : Envoyer un message privé
app.post('/messages/private', authenticate, (req, res) => {
    const username = req.user.username;
    const { conversationId, text } = req.body;

    if (!conversationId) {
        return res.status(400).json({ error: "conversationId requis." });
    } else if (!text) {
        return res.status(400).json({ error: "Le message doit avoir un contenu." });
    }

    // Vérifier si l'utilisateur à participé à la conversation
    const verifySql = `SELECT * FROM conversations WHERE id = ? AND (user1 = ? OR user2 = ?)` ;
    db.get( verifySql, [conversationId, username, username], (err, conversation) => {
            if (err || !conversation) return res.status(403).json({ error: "Accès refusé." });
            
            // Si OK on insère le message
            const insertSql = `INSERT INTO pvMessages (conversationId, author, text, date) VALUES (?, ?, ?, ?)`;
            db.run(insertSql, [conversationId, username, text, Date.now()], (err) => {
                    if (err) return res.status(500).json({ error: "Erreur interne." });
                    
                    // Puis on met à jour la conversation 
                    const updateSql = `UPDATE conversations SET lastMessage = ?, lastMessageAt = ? WHERE id = ?`;
                    db.run(updateSql, [text, Date.now(), conversationId], (err) => {
                            if (err) return res.status(500).json({ error: "Erreur interne." });
                            res.status(201).json({ success: true });
                        }
                    );
                }
            );
        }
    );
});

// Lancement de l'écoute du serveur https sur PORT
https.createServer(httpsOptions,app).listen(PORT, () => {
    console.log(`Serveur démarré sur https://localhost:${PORT}`);
});