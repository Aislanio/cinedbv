import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import connectDB from './src/db/db.js';
import authRouter from './src/routes/authRoutes.js'

import cookieParser from 'cookie-parser'




dotenv.config()
const app = express();



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

//ROTAS
app.get('/', (req, res) => {
    res.redirect('/auth/cinema');
});

app.use('/auth', authRouter); //ROTAS DE USUARIO



// Iniciar Servidor
const PORT = process.env.PORT;
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`\x1b[32m%s\x1b[0m`, `--- Servidor Rodando com Sucesso ---`);
        console.log(`Acesse: http://localhost:${PORT}`);
    });
}).catch((err) => {
    console.error("Falha fatal ao conectar no banco. O servidor não será iniciado.");
    console.error(err);
    process.exit(1); // Encerra o processo se não tiver banco
});