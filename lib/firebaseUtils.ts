import { db } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-insecure-key';

/**
 * Encrypt sensitive data before storing in Firestore
 */
export function encryptData(data: string): string {
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
}

/**
 * Decrypt sensitive data retrieved from Firestore
 */
export function decryptData(encryptedData: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Store broker configuration in Firestore
 */
export async function storeBrokerConfig(
  userId: string,
  broker: string,
  apiKey: string,
  apiSecret: string
) {
  try {
    const userDocRef = doc(db, 'users', userId);
    const brokerConfigRef = doc(userDocRef, 'brokerConfig', broker);

    await setDoc(brokerConfigRef, {
      broker,
      apiKey: encryptData(apiKey),
      apiSecret: encryptData(apiSecret),
      status: 'inactive',
      createdAt: Timestamp.now(),
      lastUpdated: Timestamp.now(),
    });

    return { success: true, message: 'Broker config stored successfully' };
  } catch (error) {
    console.error('Error storing broker config:', error);
    throw new Error('Failed to store broker configuration');
  }
}

/**
 * Retrieve broker configuration from Firestore
 */
export async function getBrokerConfig(userId: string, broker: string) {
  try {
    const userDocRef = doc(db, 'users', userId);
    const brokerConfigRef = doc(userDocRef, 'brokerConfig', broker);
    const docSnap = await getDoc(brokerConfigRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      broker: data.broker,
      apiKey: decryptData(data.apiKey),
      apiSecret: decryptData(data.apiSecret),
      accessToken: data.accessToken ? decryptData(data.accessToken) : null,
      status: data.status,
      createdAt: data.createdAt,
      lastUpdated: data.lastUpdated,
    };
  } catch (error) {
    console.error('Error retrieving broker config:', error);
    throw new Error('Failed to retrieve broker configuration');
  }
}

/**
 * Update broker access token in Firestore
 */
export async function updateBrokerAccessToken(
  userId: string,
  broker: string,
  accessToken: string
) {
  try {
    const userDocRef = doc(db, 'users', userId);
    const brokerConfigRef = doc(userDocRef, 'brokerConfig', broker);

    await updateDoc(brokerConfigRef, {
      accessToken: encryptData(accessToken),
      status: 'active',
      lastAuthenticated: Timestamp.now(),
    });

    return { success: true, message: 'Access token updated successfully' };
  } catch (error) {
    console.error('Error updating access token:', error);
    throw new Error('Failed to update access token');
  }
}

/**
 * Create user profile in Firestore
 */
export async function createUserProfile(userId: string, email: string, displayName?: string) {
  try {
    const userDocRef = doc(db, 'users', userId);

    await setDoc(userDocRef, {
      email,
      displayName: displayName || email.split('@')[0],
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
    }, { merge: true });

    return { success: true, message: 'User profile created' };
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw new Error('Failed to create user profile');
  }
}
