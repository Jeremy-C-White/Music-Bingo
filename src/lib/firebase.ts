import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  projectId: "gen-lang-client-0864937792",
  appId: "1:332928227416:web:517e0f12c30b24667fd22d",
  apiKey: "AIzaSyCOA_suCGdAW79iDu0GojAvDxVM7TxD8K4",
  authDomain: "gen-lang-client-0864937792.firebaseapp.com",
  storageBucket: "gen-lang-client-0864937792.firebasestorage.app",
  messagingSenderId: "332928227416",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-3da9b412-e1d1-4555-b8c9-1151f8bf1a79");
export const auth = getAuth(app);
