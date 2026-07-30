import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, Timestamp, getDocFromServer } from 'firebase/firestore';

// We'll try to import the config, but handle the case where it's not there yet
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
export const googleProvider = new GoogleAuthProvider();

// Restrict sign-in to the company's Azure AD tenant (app registration "MinuteMind AI",
// client ID 5a635742-a4d9-444f-a7f9-16c17e8fef91). The primary enforcement is on the Azure
// side (single-tenant app registration), this just skips the "which account" chooser and
// sends users straight to the org login page.
export const MICROSOFT_TENANT = '0be44e1b-ba65-46db-8984-a0f386b8ef02';
export const ALLOWED_EMAIL_DOMAIN = '@packages.com.pk';

export const microsoftProvider = new OAuthProvider('microsoft.com');
microsoftProvider.setCustomParameters({ tenant: MICROSOFT_TENANT });

export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  Timestamp,
  getDocFromServer
};
export type { User };

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();
