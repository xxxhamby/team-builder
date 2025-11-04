// Your web app's Firebase configuration
// This is the object you just found in the Firebase console.
const firebaseConfig = {
  apiKey: "AIzaSyCWnB4VDxuH60J06E0XMGiNzD2m1Rq7HWw",
  authDomain: "team-builder-42438.firebaseapp.com",
  projectId: "team-builder-42438",
  storageBucket: "team-builder-42438.firebasestorage.app",
  messagingSenderId: "215714435049",
  appId: "1:215714435049:web:8b136178e7f8379bf90578",
  measurementId: "G-RJ0ZB7FJ0D"
};

// Initialize Firebase
// This syntax matches the <script> tags in your index.html file
firebase.initializeApp(firebaseConfig);

// Get a reference to the Firestore database
// This is the most important part for saving our roster!
const db = firebase.firestore();

// Log to the console (in your browser's developer tools) to confirm it's working
console.log("Firebase is connected and database is ready!");
