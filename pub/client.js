// pub/client.js

const appController = (() => {

    // --- Variables DOM ---
    const dom = {
        // Navigation / User state
        navLoginBtn: document.getElementById('navLoginBtn'),
        navSigninBtn: document.getElementById('navSigninBtn'),
        navPostBtn: document.getElementById('navPostBtn'),
        navLogoutBtn: document.getElementById('navLogoutBtn'),
        navUsername: document.getElementById('navUsername'),
        
        // Sections / Forms
        loginSection: document.getElementById('loginSection'),
        signinSection: document.getElementById('signinSection'),
        postSection: document.getElementById('postSection'),
        
        loginForm: document.getElementById('loginForm'),
        signinForm: document.getElementById('signinForm'),
        composeForm: document.getElementById('composeForm'),
        
        // Feed
        messagesList: document.getElementById('messagesList'),
        refreshBtn: document.getElementById('refreshBtn'),
        
        // Messages globaux
        flashMessage: document.getElementById('flashMessage')
    };

    // --- Utilitaires ---
    
    // Echappement XSS basique
    const escapeHTML = (str) => {
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
    };

    // Affichage des notifications flash (erreurs/succès)
    const showFlash = (msg, isError) => {
        dom.flashMessage.textContent = msg;
        dom.flashMessage.className = `flash ${isError ? 'error' : 'success'}`;
        
        // On remonte en haut de page pour voir le message
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Double requestAnimationFrame pour laisser le navigateur appliquer le display: block
        // avant d'ajouter la classe qui déclenche la transition CSS effectuant le slide.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                dom.flashMessage.classList.add('show');
            });
        });

        setTimeout(() => {
            dom.flashMessage.classList.remove('show');
            // On attend la fin de la transition CSS (400ms) avant de remettre le display:none
            setTimeout(() => {
                if (!dom.flashMessage.classList.contains('show')) {
                    dom.flashMessage.classList.add('hidden');
                }
            }, 400);
        }, 4000);
    };

    // Masque tous les formulaires
    const hideForms = () => {
        dom.loginSection.classList.add('hidden');
        dom.signinSection.classList.add('hidden');
        dom.postSection.classList.add('hidden');
        
        // Réinitialise les inputs
        dom.loginForm.reset();
        dom.signinForm.reset();
        dom.composeForm.reset();
    };

    // Affiche un formulaire spécifique
    const showForm = (sectionId) => {
        hideForms();
        document.getElementById(sectionId).classList.remove('hidden');
        // Focus sur le premier input
        const firstInput = document.getElementById(sectionId).querySelector('input, textarea');
        if (firstInput) firstInput.focus();
    };


    // --- Logique d'authentification UI ---
    
    // Met à jour la Nav bar selon l'état actuel de LocalStorage
    const updateNavUI = () => {
        const username = localStorage.getItem('username');
        const token = localStorage.getItem('token');
        const isLoggedIn = !!username && !!token;

        if (isLoggedIn) {
            // Utilisateur connecté
            dom.navLoginBtn.classList.add('hidden');
            dom.navSigninBtn.classList.add('hidden');
            
            dom.navUsername.textContent = `@${username}`;
            dom.navUsername.classList.remove('hidden');
            
            dom.navPostBtn.classList.remove('hidden');
            dom.navLogoutBtn.classList.remove('hidden');
            
            // Si le login est affiché, on le cache
            if (!dom.loginSection.classList.contains('hidden') || !dom.signinSection.classList.contains('hidden')) {
                hideForms();
            }
        } else {
            // Visiteur
            dom.navUsername.classList.add('hidden');
            dom.navPostBtn.classList.add('hidden');
            dom.navLogoutBtn.classList.add('hidden');
            
            dom.navLoginBtn.classList.remove('hidden');
            dom.navSigninBtn.classList.remove('hidden');
            
            // Si le form "Nouveau message" est affiché, on le cache
            if (!dom.postSection.classList.contains('hidden')) {
                hideForms();
            }
        }
    };

    // Déconnexion
    const handleLogout = () => {
        localStorage.removeItem('username');
        localStorage.removeItem('token');
        showFlash("Vous êtes déconnecté.", false);
        updateNavUI();
    };


    // --- Appels AJAX / Fetch ---

    // 1. Inscription (Création compte) : /signin POST
    dom.signinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = dom.signinForm.signinUsername.value.trim();
        const password = dom.signinForm.signinPassword.value.trim();

        try {
            const res = await fetch('/signin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                hideForms();
                showFlash("Votre compte a été créé ! Connectez-vous maintenant.", false);
                showForm('loginSection');
            } else {
                showFlash(data.error || "Erreur lors de l'inscription.", true);
            }
        } catch (err) {
            showFlash("Impossible de contacter le serveur.", true);
        }
    });

    // 2. Connexion : /login POST
    dom.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = dom.loginForm.loginUsername.value.trim();
        const password = dom.loginForm.loginPassword.value.trim();

        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok) {
                // Succès : Sauvegarde dans localStorage !!
                localStorage.setItem('username', username);
                localStorage.setItem('token', data.token);
                
                hideForms();
                updateNavUI();
                showFlash("Connexion réussie.", false);
            } else {
                showFlash(data.error || "Identifiants invalides.", true);
            }
        } catch (err) {
            showFlash("Impossible de contacter le serveur.", true);
        }
    });

    // 3. Publier Message : /post POST
    dom.composeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = dom.composeForm.messageText.value.trim();
        const token = localStorage.getItem('token');

        if (!token) {
            showFlash("Vous devez être connecté pour publier.", true);
            handleLogout();
            return;
        }

        try {
            const res = await fetch('/post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, text })
            });
            const data = await res.json();

            if (res.ok) {
                hideForms();
                showFlash("Votre message a été publié !", false);
                fetchMessages();
            } else {
                showFlash(data.error || "Erreur de publication. Veuillez vous reconnecter.", true);
                if (res.status === 401) {
                    handleLogout();
                }
            }
        } catch (err) {
            showFlash("Impossible de contacter le serveur.", true);
        }
    });

    // 4. Flux des messages : /messages GET
    const fetchMessages = async () => {
        dom.messagesList.innerHTML = '<p class="loading">Actualisation des messages...</p>';
        try {
            const res = await fetch('/messages');
            if (!res.ok) throw new Error("Erreur serveur API");
            const messages = await res.json();
            renderMessages(messages);
        } catch (err) {
            dom.messagesList.innerHTML = '<p class="flash error">Impossible de charger le fil d\'actualité.</p>';
        }
    };

    const renderMessages = (messages) => {
        dom.messagesList.innerHTML = '';
        if (messages.length === 0) {
            dom.messagesList.innerHTML = '<p style="text-align: center; color: #657786; padding: 20px;">Aucun message à afficher pour l\'instant.</p>';
            return;
        }

        messages.forEach(msg => {
            const dateStr = new Date(msg.date).toLocaleString('fr-FR', {
                dateStyle: 'medium', timeStyle: 'short'
            });
            
            const card = document.createElement('div');
            card.className = 'message-card';
            card.innerHTML = `
                <div class="msg-header">
                    <span class="msg-author">@${escapeHTML(msg.author)}</span>
                    <span class="msg-date">· ${dateStr}</span>
                </div>
                <div class="msg-text">${escapeHTML(msg.text)}</div>
            `;
            dom.messagesList.appendChild(card);
        });
    };


    // --- Initialisation ---
    const init = () => {
        // Event listeners Nav Menu
        dom.navLoginBtn.addEventListener('click', () => showForm('loginSection'));
        dom.navSigninBtn.addEventListener('click', () => showForm('signinSection'));
        dom.navPostBtn.addEventListener('click', () => showForm('postSection'));
        dom.navLogoutBtn.addEventListener('click', handleLogout);
        
        dom.refreshBtn.addEventListener('click', fetchMessages);
        
        // Premier setup
        updateNavUI();
        fetchMessages();
    };

    // Expose fonctions si besoin au global (par exemple pour onClick="appController.hideForms()")
    return {
        init,
        hideForms
    };

})();

// Démarrage
document.addEventListener('DOMContentLoaded', appController.init);
