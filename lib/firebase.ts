import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBhnSMiM45rdk1MUKbrl-Xs4Ms8B3kgy4c",
  authDomain: "bauhaus-ean.firebaseapp.com",
  projectId: "bauhaus-ean",
  storageBucket: "bauhaus-ean.firebasestorage.app",
  messagingSenderId: "11569765198",
  appId: "1:11569765198:web:70ad63d1343efcb0ff9c1f"
};

// Initiera Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };