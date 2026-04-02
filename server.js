const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
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

// --- API JSON ---

// POST /signin : Créer un nouvel utilisateur
app.post('/signin', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username et password requis." });
    }

    const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
    db.run(sql, [username, password], function(err) {
        if (err) {
            // Utilisateur existe déjà ou autre erreur
            return res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris ou erreur interne." });
        }
        res.status(201).json({ success: true, id: this.lastID, username });
    });
});

// POST /login : Vérifier les identifiants utilisateur
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username et password requis." });
    }

    const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
    db.get(sql, [username, password], (err, row) => {
        if (err || !row) {
            return res.status(401).json({ error: "Identifiants invalides." });
        }
        const token = crypto.randomUUID();
        sessions[token] = row.username;
        res.json({ success: true, username: row.username, token });
    });
});

// GET /messages : Obtenir la liste de tous les messages (ordre chronologique)
app.get('/messages', (req, res) => {
    const sql = "SELECT * FROM messages ORDER BY date DESC";
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// POST /post : Publier un nouveau message
app.post('/post', (req, res) => {
    const { token, text } = req.body;
    if (!token || !text) {
        return res.status(400).json({ error: "Token et text requis." });
    }

    const username = sessions[token];
    if (!username) {
        return res.status(401).json({ error: "Session invalide ou expirée." });
    }

    // Si OK, on insert le message
    const insertSql = "INSERT INTO messages (author, text) VALUES (?, ?)";
    db.run(insertSql, [username, text], function(errPost) {
        if (errPost) {
            return res.status(500).json({ error: errPost.message });
        }
        res.status(201).json({
            success: true,
            id: this.lastID,
            author: username,
            text: text,
            date: new Date().toISOString()
        });
    });
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
