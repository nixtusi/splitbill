// firebase-config.js

// Firebase core
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

// Firestore（リアルタイム onSnapshot を使うので Lite 版じゃなく通常版）
import {
  getFirestore,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// あなたの Firebase 設定（そのまま使う）
const firebaseConfig = {
  apiKey: "AIzaSyCmWt2_pcC4w4oY1LPdn7xCJU7GA1yMFpQ",
  authDomain: "splitbill-17422.firebaseapp.com",
  projectId: "splitbill-17422",
  storageBucket: "splitbill-17422.firebasestorage.app",
  messagingSenderId: "901872620902",
  appId: "1:901872620902:web:e98c119c0a2fb90a4724a7",
  measurementId: "G-TJH29GVF5V"
};

// Firebase 初期化
const app = initializeApp(firebaseConfig);

// Firestore インスタンス export
export const db = getFirestore(app);
export { serverTimestamp };