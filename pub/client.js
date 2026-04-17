// pub/client.js

const appController = (() => {

    // --- Variables DOM ---
    const dom = {
        // Navigation / User state
        navLoginBtn: document.getElementById('navLoginBtn'),
        navSigninBtn: document.getElementById('navSigninBtn'),
        
        navLogoutBtn: document.getElementById('navLogoutBtn'),
        navPostBtn: document.getElementById('navPostBtn'),
        navUsername: document.getElementById('navUsername'),
        navHomeBtn: document.getElementById('navHomeBtn'),
        navConversationBtn: document.getElementById('navConversationBtn'),
        
        navAddBtn: document.getElementById('navAddBtn'),
        navPvmBtn: document.getElementById('navPvmBtn'),
        
        // Sections 
        loginSection: document.getElementById('loginSection'),
        signinSection: document.getElementById('signinSection'),
        postSection: document.getElementById('postSection'),
        addSection: document.getElementById('addSection'),
        privateSection: document.getElementById('privateSection'),
        
        // Forms
        loginForm: document.getElementById('loginForm'),
        signinForm: document.getElementById('signinForm'),
        composeForm: document.getElementById('composeForm'),
        addForm: document.getElementById('addForm'),
        privateForm: document.getElementById('privateForm'),
        
        // Feed
        messagesList: document.getElementById('messagesList'),
        refreshBtn: document.getElementById('refreshBtn'),

        // Conversations
        conversationList: document.getElementById('conversationList'),
        refreshConversationBtn: document.getElementById('refreshConversationBtn'),

        // Private messages 
        privateList: document.getElementById('privateList'),
        refreshPvmBtn: document.getElementById('refreshPvmBtn'),

        // Pages
        feedView: document.getElementById('feedView'),
        conversationView: document.getElementById('conversationView'),
        privateView: document.getElementById('privateView'),
        
        // Messages globaux
        flashMessage: document.getElementById('flashMessage')
    };

    // --- Variables d'Etat ---
    
    // Suit l'état de messagesList
    const messageState = {
        messages: [],
        latestTimestamp: null,
        offset: 0,
        endOfpage: false,
        isLoading: false,
        limit: 10
    }

    // Suit l'identifiant de la conversation en cours
    const conversationState = {
        currentConversationId: null
    };

    // --- Utilitaires ---
    
    // Echappement XSS basique
    const escapeHTML = (str) => {
        if (!str) return '';
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

    
    const sectionElements =  [dom.loginSection, dom.signinSection, dom.postSection, dom.addSection, dom.privateSection];
    const formElements =  [dom.loginForm, dom.signinForm, dom.composeForm, dom.addForm, dom.privateForm];
    const pages = [dom.feedView, dom.conversationView, dom.privateView];

    // Masque tous les formulaires
    const hideForms = () => {
        sectionElements.forEach( e => e.classList.add('hidden'));
        // Réinitialise les inputs
        formElements.forEach(e => e.reset());
    };

    // Affiche un formulaire spécifique
    const showForm = (sectionId) => {
        hideForms();
        document.getElementById(sectionId).classList.remove('hidden');
        // Focus sur le premier input
        const firstInput = document.getElementById(sectionId).querySelector('input, textarea');
        if (firstInput) firstInput.focus();
    };

    // Affiche une page spécifique
    const showPage = (pageId) => {
        hideForms();
        pages.forEach(p => {
            p.classList.add('hidden');
        });
        document.getElementById(pageId).classList.remove('hidden');
    }


    const fetchAPI = async ( url, options = {}) => {
        const headers = {
            'Content-Type': 'application/json',
            'sessionid': localStorage.getItem('sessionId'),
            ...options.headers
        };
        const res = await fetch(url , { ...options,headers})
        const data = await res.json() ;
        return {res, data};
    }

    // --- Logique d'authentification UI ---

    // Met à jour la Nav bar selon l'état actuel de LocalStorage
    const updateNavUI = () => {
        const sessionId = localStorage.getItem('sessionId');
        const username = localStorage.getItem('username');
        const isLoggedIn = !!sessionId;

        if (isLoggedIn) {
            // Utilisateur connecté
            dom.navLoginBtn.classList.add('hidden');
            dom.navSigninBtn.classList.add('hidden');
            
            dom.navUsername.textContent = `@${username}`;
            dom.navUsername.classList.remove('hidden');
            
            dom.navLogoutBtn.classList.remove('hidden');
            dom.navConversationBtn.classList.remove('hidden');
            dom.navHomeBtn.classList.remove('hidden');

            dom.navPostBtn.classList.remove('hidden');
            
            // Si le login est affiché, on le cache
            if (!dom.loginSection.classList.contains('hidden') || !dom.signinSection.classList.contains('hidden')) {
                hideForms();
            }
        } else {
            // Visiteur
            dom.navUsername.classList.add('hidden');
            
            dom.navLogoutBtn.classList.add('hidden');
            dom.navConversationBtn.classList.add('hidden');
            dom.navHomeBtn.classList.add('hidden');

            dom.navPostBtn.classList.add('hidden');
            
            dom.navLoginBtn.classList.remove('hidden');
            dom.navSigninBtn.classList.remove('hidden');
            
            // Si le form "Nouveau message" est affiché, on le cache
            if (!dom.postSection.classList.contains('hidden')) {
                hideForms();
            }
        }
    };

    // Déconnexion
    const handleLogout = async () => {
        try {
            await fetchAPI('/logout', { method: 'POST' });
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            localStorage.removeItem('sessionId');
            localStorage.removeItem('username');
            showFlash("Vous êtes déconnecté.", false);
            showPage('feedView');
            updateNavUI();
        }
    };

    // --- Builders de formats html  ---

    // Crée la structure html d'un message 
    const buildMessageCard = (message) => {
        const dateStr = new Date(message.date).toLocaleString('fr-FR', {
            dateStyle: 'medium', timeStyle: 'short'
        });
        
        const card = document.createElement('div');
        card.className = 'message-card';
        card.innerHTML = `
            <div class="msg-header">
                <span class="msg-author">@${escapeHTML(message.author)}</span>
                <span class="msg-date">· ${dateStr}</span>
            </div>
            <div class="msg-text">${escapeHTML(message.text)}</div>
        `;
        return card;
    }

    // Ajoute un message en fin de liste
    const appendMessageCard = (message) => {
        const card = buildMessageCard(message);
        dom.messagesList.appendChild(card);
    }

    // Ajoute un message en tête de liste
    const prependMessageCard = (message) => {
        const card = buildMessageCard(message);
        dom.messagesList.prepend(card);
    }

    // Crée la structure html d'une conversation 
    const buildConversationCard = (conversation) => {
        const dateStr = conversation.lastMessageAt 
            ? new Date(conversation.lastMessageAt).toLocaleString('fr-FR', { 
                dateStyle: 'medium', timeStyle: 'short' })
            : '';
        
        const username = localStorage.getItem('username');
        const otherUser = conversation.user1 === username ? conversation.user2 : conversation.user1;
        const card = document.createElement('div');

        card.className = 'conv-card';
        card.innerHTML = `
            <div class="conv-header">
                <span class="conv-author">@${escapeHTML(otherUser)}</span>
                <span class="conv-date">· ${dateStr}</span><br>
            </div>
            <div class="conv-text conv-preview">${escapeHTML(conversation.lastMessage) || '<em>Aucun message</em>'}</div>
            
            
        `;
        
        card.addEventListener('click', () => openConversation(conversation.id));
        
        return card;
    }; 

    // --- Appels AJAX / Fetch ---

    // --- Loaders de données GET---

    // 1. <  Récupère les premiers messages et les charge sur la page : /messages GET  >
    const loadInitialMessages = async () => {
        dom.messagesList.innerHTML = '<p class="loading">Actualisation des messages...</p>';
        try {
            const {res, data} = await fetchAPI(`/messages?limit=${messageState.limit}&offset=0`);
            
            if (!res.ok) throw new Error("Erreur serveur API");
            
            messageState.messages = data;
            messageState.offset = data.length;
            messageState.latestTimestamp = data.length > 0 ? data[0].date : null;
            messageState.endOfpage = data.length !== messageState.limit;
            
            dom.messagesList.innerHTML = '';
            if (data.length === 0) {
                dom.messagesList.innerHTML = '<p style="text-align: center; color: #657786; padding: 20px;">Aucun message à afficher pour l\'instant.</p>';
                return;
            }
            data.forEach(msg => appendMessageCard(msg));
        } catch (err) {
            dom.messagesList.innerHTML = '<p class="flash error">Impossible de charger le fil d\'actualité.</p>';
        }
    }

    // 2. <  // Récupère tout les messages récents : /messages GET  > 
    const loadNewMessages = async () => {
        try {
            const {res, data} = await fetchAPI(`/messages?loadAfterLatest=${messageState.latestTimestamp}`);
            
            if(!res.ok) throw new Error("Erreur serveur API");
            
            if (data.length === 0) return;

            messageState.messages = [...data, ...messageState.messages];
            messageState.offset += data.length ;
            messageState.latestTimestamp = data[0].date;
            
            data.forEach(msg => prependMessageCard(msg));
        } catch (err) {
            console.error('Échec de récupération des nouveaux messages:',err);
        }
    };

    // 3. <  Récupère les messages plus anciens basé sur un offset : /messages GET  >
    const loadOldMessages = async () => {
        if (messageState.isLoading || messageState.endOfpage) return;
        try {
            messageState.isLoading = true;
            
            const {res, data} = await fetchAPI(`/messages?limit=${messageState.limit}&offset=${messageState.offset}`);
            if(!res.ok) throw new Error("Erreur serveur API");
            
            if (data.length === 0) return;

            messageState.messages = [...messageState.messages, ...data];
            messageState.offset += data.length ;
            messageState.endOfpage = data.length !== messageState.limit;
            
            data.forEach(msg => appendMessageCard(msg));
        } catch (err) {
            dom.messagesList.innerHTML = '<p class="flash error">Impossible de charger le fil d\'actualité.</p>';
        } finally {
            messageState.isLoading = false;
        }
    };

    // 4. <  Récupère les conversation de l'utilisateur : /conversations GET >
    const loadConversations = async () => {
        dom.conversationList.innerHTML = '<p class="loading">Actualisation des conversations...</p>';
        try {
            const {res, data} = await fetchAPI(`/conversations`, {
                method: 'GET',
            });
            
            if (!res.ok) throw new Error("Erreur serveur API");

            dom.conversationList.innerHTML = '';
            if (data.length === 0) {
                dom.conversationList.innerHTML = '<p style="text-align: center; color: #657786; padding: 20px;">Aucune conversation active.</p>';
                return;
            }
            
            data.forEach( conv => {
                dom.conversationList.appendChild(buildConversationCard(conv));
            });
        } catch (err) {
            dom.conversationList.innerHTML = '<p class="flash error">Impossible de charger les conversations.</p>';
        }
    }

    // 5. <  Récupère les messages entre deux utilisateurs : /messages/private POST  >
    const loadPvMessages = async (conversationId) => {
        dom.privateList.innerHTML = '<p class="loading">Actualisation des messages...</p>';
        try {
            const {res, data} = await fetchAPI(`/messages/private?conversationId=${conversationId}`, {
                method: 'GET',
            });
            
            if (!res.ok) throw new Error("Erreur serveur API");

            dom.privateList.innerHTML = '';
            if (data.length === 0) {
                dom.privateList.innerHTML = '<p style="text-align: center; color: #657786; padding: 20px;">Aucun message.</p>';
                return;
            }

            data.forEach( conv => {
                dom.privateList.appendChild(buildMessageCard(conv));
            });
        } catch (err) {
            dom.privateList.innerHTML = '<p class="flash error">Impossible de charger la conversation.</p>';
        }
    };

    // --- Formulaires POST ---

    // 1. <  Inscription (Création compte) : /signin POST  >
    dom.signinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = dom.signinForm.signinUsername.value.trim();
        const password = dom.signinForm.signinPassword.value.trim();
        const passwordConfirmation = dom.signinForm.signinPasswordConfirmation.value.trim();

        try {
            const {res, data} = await fetchAPI('/signin', {
                method: 'POST',
                body: JSON.stringify({ username, password, passwordConfirmation })
            });
            
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

    // 2. <  Connexion : /login POST  > 
    dom.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = dom.loginForm.loginUsername.value.trim();
        const password = dom.loginForm.loginPassword.value.trim();

        try {
            const {res, data} = await fetchAPI('/login',{
                method: 'POST',
                body: JSON.stringify({ username, password })
            });

            if (res.ok) {
                // Succès : Sauvegarde dans localStorage !!
                localStorage.setItem('sessionId', data.sessionId);
                localStorage.setItem('username', username);
                
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

    // 3. <  Publier Message : /post POST  >
    dom.composeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = dom.composeForm.messageText.value.trim();
        
        try {
            const {res, data} = await fetchAPI('/post', {
                method: 'POST',
                body: JSON.stringify({ text })
            });

            if (res.ok) {
                hideForms();
                showFlash("Votre message a été publié !", false);
                loadInitialMessages();
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
     
    // 4. <  Commencer à communiquer avec un utlisateur : /conversations POST >
    dom.addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const recipient = dom.addForm.addUser.value.trim();
        try {
            const {res, data} = await fetchAPI('/conversations', {
                method: 'POST',
                body: JSON.stringify({ recipient })
            });

            if (res.ok) {
                hideForms();
                showFlash("Ajout réussi.", false);
                loadConversations();
            } else {
                showFlash(data.error || "Erreur lors de l'envoi.", true);
            }
        } catch ( err ){
            showFlash("Impossible de contacter le serveur.", true);
        }
        
    });

    // 5. <  Envoyer un message privé : /messages/private POST  >
    dom.privateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = dom.privateForm.privateText.value.trim();
        const conversationId = conversationState.currentConversationId;

        try {
            const {res, data} = await fetchAPI('/messages/private', {
                method: 'POST',
                body: JSON.stringify({ conversationId, text })
            });
        
            if (res.ok) {
                hideForms();
                loadPvMessages(conversationId); // reload the thread
            } else {
                showFlash(data.error || "Erreur lors de l'envoi.", true);
            }
        } catch (err) {
            showFlash("Impossible de contacter le serveur.", true);
        }
    });

    const openConversation = (conversationId) => {
        conversationState.currentConversationId = conversationId;
        showPage('privateView');
        loadPvMessages(conversationId);
    } 

    // --- Initialisation ---
    const init = () => {
        // Nav Listeners
        dom.navLoginBtn.addEventListener('click', () => showForm('loginSection'));
        dom.navSigninBtn.addEventListener('click', () => showForm('signinSection'));
        dom.navPostBtn.addEventListener('click', () => showForm('postSection'));
        dom.navAddBtn.addEventListener('click', () => showForm('addSection'));
        dom.navPvmBtn.addEventListener('click', () => showForm('privateSection'));
        dom.navLogoutBtn.addEventListener('click', handleLogout);
        dom.navConversationBtn.addEventListener('click', () => {
            showPage('conversationView');
            loadConversations();    
        });
        dom.navHomeBtn.addEventListener('click', () => showPage('feedView'));
        
        // Refresh Listeners
        dom.refreshBtn.addEventListener('click', loadInitialMessages);
        dom.refreshConversationBtn.addEventListener('click', loadConversations);
        dom.refreshPvmBtn.addEventListener('click', () => loadPvMessages(conversationState.currentConversationId));
        window.addEventListener('scroll', () => {
            const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
            if (nearBottom) loadOldMessages();
        });

        // Premier setup
        loadInitialMessages();
        updateNavUI();
        setInterval(loadNewMessages, 5000);
    };

    // Expose fonctions si besoin au global (par exemple pour onClick="appController.hideForms()")
    return {
        init,
        hideForms
    };

})();

// Démarrage
document.addEventListener('DOMContentLoaded', appController.init);
