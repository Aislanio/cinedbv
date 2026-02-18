import mongoose from "mongoose";
import dotenv from 'dotenv';
dotenv.config();

const connectDB = async() =>{
 try {
    await mongoose.connect(process.env.URL);
    console.log('MongoDb conectado');
 } catch (error) {
    console.log('erro: ' + error);
 }
}

export default connectDB;