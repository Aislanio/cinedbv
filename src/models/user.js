import mongoose from 'mongoose';

const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) { // Aumentei para 5 para maior segurança
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `DBV-${result}`;
};

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    // Essencial para Login Social:
    email: { type: String, required: true, unique: true, lowercase: true }, 
    photo: { type: String },
    googleId: { type: String, unique: true }, // Bom guardar o ID interno do Google
    
    myCode: { type: String, unique: true },
    
    invitedBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 },
    
    // Votação
    votedMovieId: { type: String, default: null },
    voteTimestamp: { type: Date }
}, { 
    timestamps: true 
});

userSchema.pre('save', async function() {
    if (!this.myCode) {
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) { // Trava de segurança contra loop infinito
            const newCode = generateRandomCode();
            const existingUser = await this.constructor.findOne({ myCode: newCode });
            
            if (!existingUser) {
                this.myCode = newCode;
                isUnique = true;
            }
            attempts++;
        }
    }
    
});

export default mongoose.models.User || mongoose.model('User', userSchema);