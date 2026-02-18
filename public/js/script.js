// ==========================================
// ESTADO GLOBAL DA APLICAÇÃO
// ==========================================
let state = {
    user:  null,
    movies: [],
    leaderboard: [],
    endTime: null,
    votingOpen: false
};

// Substitua pelo seu Client ID do Google Cloud Console
const GOOGLE_CLIENT_ID = "768703968750-dohth3srv0r25f970531gtp6oqe7574n.apps.googleusercontent.com"; 

// ==========================================
// INICIALIZAÇÃO
// ==========================================
window.onload = async () => {
    initializeGoogleAuth();

    // 1. Carrega as configurações e filmes
    await Promise.all([fetchConfig(), fetchMovies(), fetchLeaderboard()]);

    // 2. Pergunta ao backend quem é o usuário atual (Baseado no Cookie)
    await checkSession(); 

    // 3. Renderiza a tela
    renderMovies();
    renderLeaderboard();
    checkLoginState();
    
    setInterval(updateTimer, 1000);
    setTimeout(() => document.getElementById('loadingScreen').style.transform = 'translateY(-100%)', 500);
};


async function checkSession() {
    try {
        const res = await fetch('/auth/me'); // Rota que verifica o JWT no cookie
        const data = await res.json();
        
        if (data.success) {
            state.user = data.user;
        } else {
            state.user = null;
        }
    } catch (error) {
        state.user = null;
    }
}


// ==========================================
// REQUISIÇÕES AO BACKEND (API FETCH)
// ==========================================

async function fetchMovies() {
    try {
        const res = await fetch('/auth/movies');
        const data = await res.json();
        if (data.success) state.movies = data.movies;
    } catch (error) {
        console.error("Erro ao carregar filmes", error);
    }
}

async function fetchLeaderboard() {
    try {
        const res = await fetch('/auth/leaderboard');
        const data = await res.json();
        if (data.success) state.leaderboard = data.leaderboard;
    } catch (error) {
        console.error("Erro ao carregar ranking", error);
    }
}

async function fetchConfig() {
    try {
        const res = await fetch('/auth/config');
        const data = await res.json();
        if (data.success) {
            state.votingOpen = data.config.votingOpen;
            state.endTime = new Date(data.config.endTime).getTime();
        }
    } catch (error) {
        console.error("Erro ao carregar configs", error);
    }
}

async function refreshUserData() {
    if (!state.user || !state.user.uid) return;
    try {
        const res = await fetch(`/auth/me/${state.user.uid}`);
        const data = await res.json();
        if (data.success) {
            state.user = data.user;
            localStorage.setItem('cinedbv_user', JSON.stringify(state.user));
        } else {
            // Se o usuário não existir mais no banco, limpa o localStorage
            window.logout(false); 
        }
    } catch (error) {
        console.error("Erro ao atualizar usuário", error);
    }
}


// ==========================================
// LÓGICA DE AUTENTICAÇÃO (GOOGLE)
// ==========================================

function initializeGoogleAuth() {
    window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse // Quando o login der certo, ele chama a nossa função!
    });

    // Pede ao Google para desenhar o botão oficial na nossa Div
    window.google.accounts.id.renderButton(
        document.getElementById("googleSignInDiv"),
        { 
            theme: "filled_black", // Fica escuro para combinar com o cinema
            size: "large", 
            shape: "rectangular",
            width: 280, // Largura para caber certinho no modal
            text: "signin_with" 
        }  
    );
}

// PODE APAGAR A FUNÇÃO window.handleLogin = () => { ... } INTEIRA!

// A função handleGoogleResponse CONTINUA EXATAMENTE IGUAL, não precisa mexer nela!


// O que acontece quando o Google devolve o "Token Gigante"
async function handleGoogleResponse(response) {
    const credential = response.credential;
    const inviteCode = document.getElementById('inviteCodeSuffix').value;
    
    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential, inviteCode })
        });
        
        const data = await res.json();
        
        if (data.success) {
            state.user = data.user; // Salva apenas na memória da página
            window.toggleModal('loginModal', false);
            
            // Recarrega filmes para atualizar os botões de voto
            await fetchMovies();
            checkLoginState();
            renderMovies();
        }
    } catch (error) {
        alert("Erro no login.");
    }
}

window.logout = async (showConfirm = true) => {
    if (!showConfirm || confirm("Sair do Clube?")) {
        await fetch('auth/logout', { method: 'POST' });
        state.user = null;
        // Ao recarregar, o checkSession() verá que não há mais cookie
        location.reload(); 
    }
};


// ==========================================
// LÓGICA DE VOTAÇÃO E TICKETS
// ==========================================

window.vote = async (movieId) => {
    if (!state.votingOpen) return alert("Votação encerrada!");
    
    if (!state.user) {
        window.pendingVoteId = movieId;
        window.toggleModal('loginModal', true);
        return;
    }

    try {
        const res = await fetch('/auth/movies/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({movieId })
        });

        const data = await res.json();
        console.log(data)
        if (data.success) {
            playTicketAnimation();

            // Atualiza o estado local para refletir o voto imediatamente
            state.user.votedMovieId = movieId;
            // Atualiza os filmes e a tela
            await fetchMovies();
            renderMovies();
            updateWalletUI();
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert("Erro ao processar voto. Tente novamente.");
    }
};

window.showMyTicket = () => {
    if (!state.user || !state.user.votedMovieId) return;
    
    // OBS: Ajustado para usar o _id do MongoDB
    const m = state.movies.find(m => m._id === state.user.votedMovieId);
    
    if (m) {
        document.getElementById('ticketTitle').innerText = m.title;
        document.getElementById('ticketUser').innerText = state.user.name;
        document.getElementById('ticketCode').innerText = state.user.myCode;
        document.getElementById('ticketQr').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=TICKET:${state.user.votedMovieId}`;
        
        window.toggleModal('viewTicketModal', true);
    }
};


// ==========================================
// FUNÇÕES DE UI / RENDERIZAÇÃO
// ==========================================

function renderMovies() {
    const grid = document.getElementById('moviesGrid');
    grid.innerHTML = '';
    
    if (state.movies.length === 0) {
        grid.innerHTML = '<p class="text-center col-span-full text-white/50">Nenhum filme disponível.</p>';
        return;
    }

    const maxVotes = Math.max(...state.movies.map(m => m.votes));
    
    state.movies.forEach(m => {

        console.log(m);
        const isLeader = maxVotes > 0 && m.votes === maxVotes;
        const isMine = state.user && state.user.votedMovieId === m._id; // Usando _id do Mongo
        
        let borderClass = isMine ? 'border-cinema-gold bg-cinema-gold/10' : 'border-white/10';
        let fireEffect = (isLeader && state.votingOpen) ? 'winner-fire' : '';
        let opacity = (!state.votingOpen && !isLeader) ? 'opacity-50 grayscale' : '';
        
        if (!state.votingOpen && isLeader) borderClass = 'border-cinema-gold shadow-[0_0_30px_rgba(255,215,0,0.5)] scale-105 z-10';

        const btnHtml = !state.votingOpen 
            ? `<button disabled class="w-full py-3 bg-gray-800 text-gray-500 font-bold uppercase cursor-not-allowed">Encerrado</button>`
            : `<button onclick="window.vote('${m._id}')" class="w-full py-3 rounded font-bold uppercase transition shadow-lg ${isMine ? 'bg-green-600 text-white' : 'bg-gradient-to-r from-cinema-gold to-yellow-600 text-black hover:scale-105'}">${isMine ? 'Voto Confirmado' : 'Votar'}</button>`;

        grid.innerHTML += `
            <div class="glass-card rounded-xl overflow-hidden relative group transition-all duration-300 ${borderClass} ${fireEffect} ${opacity}">
                <div class="relative aspect-[2/3] bg-black">
                    <img src="${m.poster}" class="w-full h-full object-cover group-hover:scale-110 transition duration-700">
                    <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                    <button onclick="window.openTrailer('${m.trailer}')" class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">
                        <div class="w-14 h-14 rounded-full border-2 border-white flex items-center justify-center bg-cinema-red text-white hover:scale-110"><i class="fa-solid fa-play text-xl ml-1"></i></div>
                    </button>
                    ${isLeader ? '<div class="absolute top-2 right-2 bg-cinema-gold text-black text-xs font-bold px-2 py-1 rounded animate-pulse shadow-lg">LÍDER</div>' : ''}
                </div>
                <div class="p-4">
                    <h3 class="text-xl font-anton text-white leading-none mb-2">${m.title}</h3>
                    <div class="flex justify-between items-center mb-4 border-t border-white/10 pt-2">
                        <span class="text-2xl font-bold ${isLeader ? 'text-cinema-gold' : 'text-white'}">${m.voteCount}</span>
                        <span class="text-[10px] uppercase tracking-widest text-slate-500">Votos</span>
                    </div>
                    ${btnHtml}
                </div>
            </div>
        `;
    });
}

function renderLeaderboard() {
    const grid = document.getElementById('leaderboardGrid');
    
    if (state.leaderboard.length === 0) {
        grid.innerHTML = '<p class="text-center text-white/50 text-sm">Seja o primeiro a convidar amigos!</p>';
        return;
    }

    let html = '<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 items-end justify-center">';
    
    state.leaderboard.slice(0, 3).forEach((u, i) => {
        let color = i===0 ? 'border-yellow-400 text-yellow-400' : (i===1 ? 'border-gray-300 text-gray-300' : 'border-orange-400 text-orange-400');
        let medal = i===0 ? '🥇' : (i===1 ? '🥈' : '🥉');
        let scale = i===0 ? 'md:-translate-y-4 md:scale-110 z-10' : '';
        
        html += `
            <div class="bg-white/5 border ${color} rounded-xl p-4 flex flex-col items-center ${scale} relative shadow-lg">
                <div class="text-3xl mb-2 drop-shadow-md">${medal}</div>
                <img src="${u.photo}" class="w-12 h-12 rounded-full border-2 border-current mb-2 object-cover">
                <div class="font-bold text-white text-center truncate w-full">${u.name.split(' ')[0]}</div>
                <div class="text-2xl font-black">${u.referralCount}</div>
            </div>`;
    });
    
    html += '</div>';
    grid.innerHTML = html;
}

// ==========================================
// FUNÇÕES UTILITÁRIAS
// ==========================================

function checkLoginState() {
    const loginBtn = document.getElementById('loginBtn');
    const userAvatar = document.getElementById('userAvatar');
    const inviteDisplay = document.getElementById('inviteCodeDisplay');
    const userWallet = document.getElementById('userWallet');

    if (state.user) {
        loginBtn.classList.add('hidden');
        userAvatar.src = state.user.photo;
        userAvatar.classList.remove('hidden');
        document.getElementById('myCode').innerText = state.user.myCode;
        inviteDisplay.classList.remove('hidden');
        updateWalletUI();
    } else {
        loginBtn.classList.remove('hidden');
        userAvatar.classList.add('hidden');
        userAvatar.src = ''; 
        inviteDisplay.classList.add('hidden');
        userWallet.classList.add('hidden');
    }
}

function updateWalletUI() {
    if (state.user && state.user.votedMovieId) {
        const w = document.getElementById('userWallet');
        w.classList.remove('hidden');
        w.classList.add('border-cinema-gold', 'bg-white/10');
        document.getElementById('userStatus').innerText = "VER TICKET";
        document.getElementById('userStatus').classList.add('text-cinema-gold');
    }
}

function updateTimer() {
    if (!state.endTime) return;
    
    const diff = state.endTime - Date.now();
    
    if (diff < 0) {
        if(state.votingOpen) {
            state.votingOpen = false;
            renderMovies();
            document.getElementById('votingClosedBanner').classList.remove('hidden');
            document.getElementById('countdownDisplay').innerText = "00:00";
            document.getElementById('countdownDisplay').classList.add('text-red-500');
        }
    } else {
        // Correção no cálculo de horas e minutos para cronômetros maiores que 1 hora
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        
        let timeString = h > 0 
            ? `${h<10?'0'+h:h}:${m<10?'0'+m:m}:${s<10?'0'+s:s}`
            : `${m<10?'0'+m:m}:${s<10?'0'+s:s}`;
            
        document.getElementById('countdownDisplay').innerText = timeString;
    }
}

function playTicketAnimation() {
    const overlay = document.getElementById('ticketAnimationOverlay');
    const ticket = document.getElementById('animatedTicket');
    overlay.classList.remove('hidden');
    ticket.classList.remove('run-ticket-animation');
    void ticket.offsetWidth;
    ticket.classList.add('run-ticket-animation');
    setTimeout(() => {
        overlay.classList.add('hidden');
        ticket.classList.remove('run-ticket-animation');
    }, 4000);
}

window.copyInvite = () => {
    if(!state.user || !state.user.myCode) return;
    const textToCopy = `🍿 *CINEDBV - Clube Pedras Preciosas* 🍿\n\nVem ajudar a escolher o filme da nossa próxima sessão! 🎬\n\n🎟️ Entra com o meu código VIP: *${state.user.myCode}*\n\n👉 Acede aqui: ${window.location.href}`;
    const textarea = document.createElement('textarea');
    textarea.value = textToCopy;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        const feedback = document.getElementById('copyFeedback');
        feedback.classList.remove('opacity-0', 'translate-y-2');
        feedback.classList.add('translate-y-0');
        setTimeout(() => {
            feedback.classList.add('opacity-0', 'translate-y-2');
            feedback.classList.remove('translate-y-0');
        }, 2000);
    } catch (err) {
        prompt("Copia o texto abaixo:", textToCopy);
    }
    document.body.removeChild(textarea);
};

window.toggleModal = (id, show) => {
    const el = document.getElementById(id);
    if (show) {
        el.classList.remove('hidden');
        setTimeout(() => el.classList.remove('opacity-0'), 10);
    } else {
        el.classList.add('opacity-0');
        setTimeout(() => el.classList.add('hidden'), 300);
    }
};

window.openTrailer = (videoId) => {
    const iframe = document.getElementById('youtubeFrame');
    const spinner = document.getElementById('loadingSpinner');
    
    // Resetar estado antes de abrir
    iframe.classList.add('opacity-0');
    spinner.classList.remove('hidden');
    
    // Define a URL (Limpa o ID por segurança)
    const cleanId = videoId.trim();
    iframe.src = `https://www.youtube.com/embed/${cleanId}?autoplay=1&rel=0`;

    // Quando o iframe terminar de baixar o conteúdo
    iframe.onload = () => {
        spinner.classList.add('hidden');
        iframe.classList.remove('opacity-0');
    };

    window.toggleModal('trailerModal', true);
};

window.closeTrailer = () => {
    const iframe = document.getElementById('youtubeFrame');
    iframe.src = ""; // Para parar o som do vídeo ao fechar
    window.toggleModal('trailerModal', false);
};