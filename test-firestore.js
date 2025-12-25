// Test script to verify Firebase Admin SDK can write to Firestore
const admin = require('firebase-admin');

// Decode the service account key
const encodedKey = process.env.FIREBASE_ADMIN_SDK_KEY;
if (!encodedKey) {
  console.error('❌ FIREBASE_ADMIN_SDK_KEY not found');
  process.exit(1);
}

const decodedKey = Buffer.from(encodedKey, 'base64').toString('utf-8');
const serviceAccountKey = JSON.parse(decodedKey);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
});

console.log('✅ Firebase Admin initialized');
console.log('Project ID:', serviceAccountKey.project_id);

// Try to write a test document
async function testFirestore() {
  try {
    const db = admin.firestore();

    // Test write
    console.log('\n📝 Testing write to Firestore...');
    await db.collection('_test').doc('test-doc').set({
      timestamp: new Date(),
      message: 'Test from Admin SDK',
    });
    console.log('✅ Write successful!');

    // Test read
    console.log('\n📖 Testing read from Firestore...');
    const doc = await db.collection('_test').doc('test-doc').get();
    if (doc.exists) {
      console.log('✅ Read successful!');
      console.log('Data:', doc.data());
    }

    // Clean up
    console.log('\n🗑️  Cleaning up...');
    await db.collection('_test').doc('test-doc').delete();
    console.log('✅ Test complete! Admin SDK is working correctly.');

  } catch (error) {
    console.error('❌ Firestore test failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
  }
}

testFirestore().then(() => process.exit(0));
