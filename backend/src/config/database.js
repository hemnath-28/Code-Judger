import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  // If a filed is not present in database it does not log error it check with correct available field
  await mongoose.connect(env.mongoUri);
}
