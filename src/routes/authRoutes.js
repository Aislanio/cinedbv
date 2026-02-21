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



// ==========================================
// 3. ROTAS DE CONFIGURAÇÃO (CRONÔMETRO)
// (Caminho no frontend: /api/config)
// ==========================================
authRouter.get('/config', async (req, res) => {
    try {
        // 1. Define a data de encerramento para hoje às 16:00 (Horário de Brasília)
        // ISO 8601 com offset -03:00 garante a precisão do fuso
        const dataEncerramento = new Date('2026-05-21T16:00:00-03:00').getTime();

        // 2. Busca e JÁ ATUALIZA para garantir que o valor seja esse
        let config = await Config.findByIdAndUpdate(
            'timer', 
            { endTime: dataEncerramento }, 
            { upsert: true, new: true } // Se não existir, cria. Se existir, retorna o novo.
        );
        
        res.status(200).json({ 
            success: true, 
            config: {
                endTime: config.endTime,
                // A votação só está aberta se o momento atual for anterior ao endTime
                votingOpen: config.endTime > Date.now() 
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Exporta O ÚNICO router que será usado no server principal (app.js ou index.js raiz)
export default authRouter;
