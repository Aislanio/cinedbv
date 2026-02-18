import mongoose from 'mongoose';

const movieSchema = new mongoose.Schema({ 
    title: { type: String, required: true },
    poster: { type: String, required: true },
    trailer: { type: String, required: true }, // YouTube ID
    desc: { type: String, required: true },
    
    // Contador para facilitar a ordenação no ranking (Top Filmes)
    voteCount: { type: Number, default: 0 },

    // Array de referências para os usuários que votaram
    voters: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }]
}, { 
    timestamps: true 
});

// Índice para busca rápida (importante se houver muitos filmes)
movieSchema.index({ voteCount: -1 });

export default mongoose.model('Movie', movieSchema);