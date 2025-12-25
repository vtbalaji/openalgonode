import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
let app: admin.app.App;

if (!admin.apps.length) {
  try {
    // Get the base64-encoded service account key from environment variable
    const encodedKey = process.env.FIREBASE_ADMIN_SDK_KEY;

    if (!encodedKey) {
      throw new Error('FIREBASE_ADMIN_SDK_KEY environment variable is missing');
    }

    // Decode base64 to get JSON string
    const decodedKey = Buffer.from(encodedKey, 'base64').toString('utf-8');

    // Parse JSON to get service account object
    const serviceAccountKey = JSON.parse(decodedKey);

    // Initialize Firebase Admin SDK
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccountKey),
    });

    console.log('✅ Firebase Admin SDK initialized successfully');
    console.log('✅ Project ID:', serviceAccountKey.project_id);
  } catch (error: any) {
    console.error('❌ Firebase Admin SDK initialization failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    throw error;
  }
} else {
  app = admin.apps[0]!;
}

// Export Firestore and Auth instances from the initialized app
export const adminDb = admin.firestore(app);
export const adminAuth = admin.auth(app);

export default admin;
