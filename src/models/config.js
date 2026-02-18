import mongoose from 'mongoose';

// Guarda configurações globais como o tempo da votação
const configSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // 'timer'
    endTime: { type: Number, required: true } // Timestamp em milissegundos
}, { _id: false });

export default mongoose.model('Config', configSchema);