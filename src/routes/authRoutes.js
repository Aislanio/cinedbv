import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
// IMPORTANTE: Faltava importar os outros dois modelos!
import User from '../models/user.js'; 
import Movie from '../models/movie.js';
import Config from '../models/config.js';
import path from 'path';
const __dirname = path.resolve();

const JWT_SECRET = process.env.JWT_SECRET
// Inicializa o cliente do Google
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'SEU_CLIENT_ID_AQUI');

// ==========================================
// 1. ROTAS DE AUTENTICAÇÃO E USUÁRIOS
// (Caminho no frontend: /api/auth/...)
// ==========================================
const authRouter = express.Router();

// ==========================================
// MIDDLEWARE DE VERIFICAÇÃO (verifyToken)
// ==========================================
const verifyToken = (req, res, next) => {
    // Busca o token dentro dos cookies (nomeado como 'token')
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Acesso negado. Faça login para continuar.' 
        });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (error) {
        res.status(403).json({ success: false, message: 'Sessão expirada ou inválida.' });
    }
};

// ==========================================
// 1. ROTAS DE AUTENTICAÇÃO
// ==========================================
authRouter.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.status(200).json({ success: true, message: 'Logout efetuado com sucesso.' });
});

authRouter.post('/login', async (req, res) => {
    try {
        const { credential, inviteCode } = req.body;
        if (!credential) return res.status(400).json({ success: false, message: 'Token do Google ausente.' });

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID, 
        });
        
        const payload = ticket.getPayload();
        const { name, email, picture: photo } = payload;

        let user = await User.findOne({ email });

        if (!user) {
            let invitedByCode = null;
            if (inviteCode && inviteCode.trim() !== "") {
                const fullCode = `DBV-${inviteCode.toUpperCase().replace('DBV-', '')}`;
                const inviter = await User.findOne({ myCode: fullCode });
                if (inviter) {
                    invitedByCode = fullCode;
                    inviter.referralCount += 1; 
                    await inviter.save();
                }
            }
            user = new User({name, email, photo, invitedBy: invitedByCode });
            await user.save(); 
        }

        // 2. GERAR O TOKEN JWT
        const token = jwt.sign({ _id:user._id}, JWT_SECRET, { expiresIn: '7d' });

        // Configuração do Cookie
        res.cookie('token', token, {
            httpOnly: true, // Impede acesso via JavaScript (mais seguro contra XSS)
            secure: process.env.NODE_ENV === 'production', // Só envia via HTTPS em produção
            sameSite: 'lax', // Proteção contra CSRF
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias em milissegundos
        });

        // Agora não precisamos mais enviar o token no corpo do JSON
        res.status(200).json({ success: true, user })
    } catch (error) {
        console.error("Erro no login:", error);
        res.status(401).json({ success: false, message: 'Falha na autenticação.' });
    }
});

authRouter.get('/me', verifyToken, async (req, res) => {
    try {
        const id = req.user._id
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ success: false, message: 'Utilizador não encontrado' });
        res.status(200).json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


authRouter.get('/cinema', async (req,res)=>{

    console.log('Acessando')
        const caminhoArquivo = path.join(__dirname, 'src', 'views', 'public', 'index.html');
        

        res.sendFile(caminhoArquivo);
    });

authRouter.get('/leaderboard', async (req, res) => {
    try {
        const topRecruiters = await User.find({ referralCount: { $gt: 0 } })
                                      .sort({ referralCount: -1 }) 
                                      .limit(5) 
                                      .select('name photo referralCount myCode');
                                      
        res.status(200).json({ success: true, leaderboard: topRecruiters });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Acopla as rotas de auth ao router principal



// ==========================================
// 2. ROTAS DE FILMES E VOTAÇÃO
// (Caminho no frontend: /api/movies/...)
// ==========================================


authRouter.get('/movies', async (req, res) => {
    try {
        const movies = await Movie.find().sort({ voteCount: -1 });
        res.status(200).json({ success: true, movies });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
authRouter.post('/movies/vote', verifyToken, async (req, res) => {
    try {
        const { movieId } = req.body;
        const userId = req.user._id;
        console.log(userId)
        // 1. Verificar se a votação está aberta
        const config = await Config.findOne();
        if (!config || config.endTime < Date.now()) {
            return res.status(400).json({ success: false, message: 'Sessão de votação encerrada!' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });

        // 2. Evitar voto repetido no mesmo filme
        if (user.votedMovieId && user.votedMovieId.toString() === movieId) {
            return res.status(400).json({ success: false, message: 'Tu já votaste neste filme!' });
        }

        // 3. Verificar se o NOVO filme existe
        const novoFilme = await Movie.findById(movieId);
        if (!novoFilme) {
            return res.status(404).json({ success: false, message: 'Filme selecionado não encontrado.' });
        }

        // 4. Lógica de Troca (Se já votou em outro antes)
        console.log("user:")
        console.log(user)
        if (user.votedMovieId) {
              console.log("REMOVER VOTO")
            // Remove o voto do filme antigo (usando field 'votes' ou 'voteCount' conforme seu Schema)
             const filmeAntigo = await Movie.findById(user.votedMovieId);
             if(filmeAntigo.voteCount >0){
                 await Movie.findByIdAndUpdate(user.votedMovieId, { $inc: { voteCount: -1 } });
             }
           
        }
         console.log("filmeNovo:")
        console.log(novoFilme);
        // 5. Salvar novo estado no Usuário
        const oldMovieId = user.votedMovieId;
        user.votedMovieId = novoFilme._id;
        user.voteTimestamp = new Date();
        await user.save();

        console.log('user DEPOIS:')
        console.log(user)

        // 6. Incrementar no Novo Filme
       // Incrementa o contador E adiciona o ID do usuário à lista de votantes
        await Movie.findByIdAndUpdate(
            novoFilme._id, 
            { 
                $inc: { voteCount: 1 },         // Soma 1 ao número
                $push: { voters: user._id }     // Adiciona o ID ao array
            }
        );
      
        res.status(200).json({ 
            success: true,
            message: oldMovieId ? `Voto alterado para: ${novoFilme.title}` : `Voto registrado: ${novoFilme.title}`,
            movieTitle: novoFilme.title 
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Função para popular o banco de dados se estiver vazio
const seedMovies = async () => {
    try {
        const count = await Movie.countDocuments();
        
        if (count === 0) {
            console.log('🎬 Banco de dados de filmes vazio. Populando...');
            
            const initialMovies = [
                {
                    title: "Milagre azul",
                    poster: "https://br.web.img3.acsta.net/pictures/21/04/29/16/26/4332051.jpg",
                    trailer: "Pc6tZGP3PIY",
                    desc: "Como a fé pode mudar o destino de 12 vidas.",
                    voteCount: 0, // Se quiser começar com votos, senão coloque 0
                    voters: []
                },
                  {
                    title: "A caminho da fé",
                    poster: "data:image/jpeg;base64,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",
                    trailer: "np3osf8p5ow&t",
                    desc: "Como a fé pode mudar o destino de 12 vidas.",
                    voteCount: 0, // Se quiser começar com votos, senão coloque 0
                    voters: []
                },
                // Você pode adicionar mais objetos de filmes aqui
            ];

            await Movie.insertMany(initialMovies);
            console.log('✅ Filmes iniciais adicionados com sucesso!');
        }
    } catch (error) {
        console.error('❌ Erro ao popular filmes:', error);
    }
};

// Executa a função
seedMovies();

// ==========================================
// 3. ROTAS DE CONFIGURAÇÃO (CRONÔMETRO)
// (Caminho no frontend: /api/config)
// ==========================================
authRouter.get('/config', async (req, res) => {
    try {
        // 1. Define a data de encerramento para HOJE (21 de Fevereiro de 2026) às 16:00
        // O fuso -03:00 garante que o horário de Brasília seja respeitado
        const dataEncerramento = new Date('2026-02-21T16:00:00-03:00').getTime();

        // 2. Atualiza o banco com a data correta de Fevereiro
        let config = await Config.findByIdAndUpdate(
            'timer', 
            { endTime: dataEncerramento }, 
            { upsert: true, new: true }
        );
        
        res.status(200).json({ 
            success: true, 
            config: {
                endTime: config.endTime,
                votingOpen: config.endTime > Date.now() 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Exporta O ÚNICO router que será usado no server principal (app.js ou index.js raiz)
export default authRouter;
