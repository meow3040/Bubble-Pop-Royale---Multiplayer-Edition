import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig, appId } from './config.js';

// --- Firebase Setup ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let user = null;
let currentRoomRef = null;
let isHost = false;

// --- Data Management ---
const skins = {
    default: { name: 'Classic', color: 'hsla(var(--h), 70%, 60%, 0.8)', price: 0, icon: '🔵' },
    neon: { name: 'Neon Pink', color: 'rgba(255, 20, 147, 0.8)', price: 100, icon: '💖' },
    gold: { name: 'Golden', color: 'rgba(255, 215, 0, 0.8)', price: 500, icon: '👑' },
    ghost: { name: 'Ghostly', color: 'rgba(255, 255, 255, 0.3)', price: 250, icon: '👻' }
};

let gameData = JSON.parse(localStorage.getItem('br_data')) || {
    coins: 0, highScore: 0, ownedSkins: ['default'], activeSkin: 'default'
};

function saveData() {
    localStorage.setItem('br_data', JSON.stringify(gameData));
    updateUI();
}

function updateUI() {
    document.getElementById('global-coins').innerText = gameData.coins;
    document.getElementById('career-coins').innerText = gameData.coins;
    document.getElementById('high-score').innerText = gameData.highScore;
    renderShop();
}

function renderShop() {
    const container = document.getElementById('shop-items');
    container.innerHTML = '';
    Object.keys(skins).forEach(skinId => {
        const skin = skins[skinId];
        const isOwned = gameData.ownedSkins.includes(skinId);
        const isActive = gameData.activeSkin === skinId;
        const card = document.createElement('div');
        card.className = `shop-card bg-slate-800/80 p-6 rounded-2xl flex flex-col items-center text-white border-2 ${isActive ? 'active' : ''}`;
        card.innerHTML = `
            <div class="text-5xl mb-4">${skin.icon}</div>
            <div class="fortnite-font text-xl">${skin.name}</div>
            <div class="text-yellow-400 mb-4">${isOwned ? 'OWNED' : '🪙 ' + skin.price}</div>
            <button onclick="handleShopAction('${skinId}')" class="w-full py-2 rounded-lg font-bold ${isOwned ? 'bg-sky-600' : 'bg-yellow-600'}">
                ${isActive ? 'SELECTED' : (isOwned ? 'SELECT' : 'BUY')}
            </button>`;
        container.appendChild(card);
    });
}

window.handleShopAction = (id) => {
    if (gameData.ownedSkins.includes(id)) { gameData.activeSkin = id; }
    else if (gameData.coins >= skins[id].price) {
        gameData.coins -= skins[id].price;
        gameData.ownedSkins.push(id);
        gameData.activeSkin = id;
    } else { return; }
    saveData();
};

// --- Multiplayer Actions ---
window.hostRoom = async () => {
    if (!user) return;
    const rid = Math.random().toString(36).substring(2, 7).toUpperCase();
    isHost = true;
    currentRoomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', rid);

    await setDoc(currentRoomRef, {
        host: { id: user.uid, score: 0, skin: gameData.activeSkin, cursor: { x: 0, y: 0 } },
        guest: null,
        status: 'waiting'
    });

    document.getElementById('room-display').classList.remove('hidden');
    document.getElementById('room-id-text').innerText = rid;
    document.getElementById('mp-info').innerText = "Waiting for challenger...";
    startRoomListener(rid);
};

window.joinRoom = async () => {
    const rid = document.getElementById('join-input').value.trim().toUpperCase();
    if (!rid || !user) return;
    const rRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', rid);
    const snap = await getDoc(rRef);
    if (snap.exists() && !snap.data().guest) {
        await updateDoc(rRef, {
            guest: { id: user.uid, score: 0, skin: gameData.activeSkin, cursor: { x: 0, y: 0 } },
            status: 'playing'
        });
        isHost = false;
        currentRoomRef = rRef;
        startRoomListener(rid);
        startGame('multi');
    } else {
        alert("Room not found or full.");
    }
};

let unsubscribe = null;
function startRoomListener(rid) {
    if (unsubscribe) unsubscribe();
    unsubscribe = onSnapshot(currentRoomRef, (doc) => {
        const data = doc.data();
        if (!data) return;
        if (data.status === 'playing' && !gameActive) startGame('multi');

        if (isHost && data.guest) {
            document.getElementById('opponent-score').innerText = data.guest.score;
            opponentState = data.guest;
        } else if (!isHost && data.host) {
            document.getElementById('opponent-score').innerText = data.host.score;
            opponentState = data.host;
        }
        if (data.status === 'ended') leaveGame(false);
    });
}

// --- Game Logic ---
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('gameCanvas');
const ctx = canvasElement.getContext('2d');

let score = 0;
let gameActive = false;
let currentMode = 'solo';
let bubbles = [];
let cursor = { x: 0, y: 0, active: false };
let opponentState = null;

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
hands.onResults((results) => {
    if (results.multiHandLandmarks?.length > 0) {
        const hand = results.multiHandLandmarks[0];
        cursor.x = (1 - hand[8].x) * canvasElement.width;
        cursor.y = hand[8].y * canvasElement.height;
        cursor.active = true;
        if (gameActive && Math.hypot(hand[8].x - hand[4].x, hand[8].y - hand[4].y) < 0.05) checkPop();
        if (gameActive && currentMode === 'multi') syncState();
    } else { cursor.active = false; }
});

const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({ image: videoElement }); }, width: 640, height: 480 });
camera.start();

async function syncState() {
    if (!currentRoomRef || !gameActive) return;
    const path = isHost ? 'host' : 'guest';
    await updateDoc(currentRoomRef, {
        [`${path}.score`]: score,
        [`${path}.cursor`]: { x: cursor.x, y: cursor.y }
    });
}

window.startGame = (mode = 'solo') => {
    currentMode = mode;
    gameActive = true;
    score = 0;
    bubbles = [];
    document.getElementById('score').innerText = "0";
    document.getElementById('navbar').classList.add('hidden');
    document.getElementById('tab-play').classList.add('hidden');
    document.getElementById('tab-multiplayer').classList.add('hidden');
    document.getElementById('game-ui').classList.remove('hidden');
    document.getElementById('room-tag').innerText = mode === 'multi' ? 'MULTIPLAYER' : 'SOLO';
    if (mode === 'multi') document.getElementById('opponent-box').classList.remove('hidden');
    requestAnimationFrame(animate);
};

window.leaveGame = async (notifyOpponent = true) => {
    gameActive = false;
    if (currentRoomRef && notifyOpponent) {
        await updateDoc(currentRoomRef, { status: 'ended' });
    }

    gameData.coins += Math.floor(score / 10);
    if (score > gameData.highScore) gameData.highScore = score;
    saveData();

    document.getElementById('game-ui').classList.add('hidden');
    document.getElementById('opponent-box').classList.add('hidden');
    document.getElementById('navbar').classList.remove('hidden');
    document.getElementById('tab-play').classList.remove('hidden');
    if (unsubscribe) unsubscribe();
    currentRoomRef = null;
};

window.switchTab = (id) => {
    ['play', 'multiplayer', 'shop', 'career'].forEach(t => document.getElementById(`tab-${t}`).classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${id}`).classList.remove('hidden');
    document.getElementById(`nav-${id}`).classList.add('active');
};

class Bubble {
    constructor() {
        this.radius = Math.random() * 25 + 20;
        this.x = Math.random() * (canvasElement.width - 50) + 25;
        this.y = canvasElement.height + 50;
        this.speed = Math.random() * 3 + 2;
        const hue = Math.random() * 360;
        this.color = skins[gameData.activeSkin].color.replace('var(--h)', hue);
    }
    update() { this.y -= this.speed; }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.strokeStyle = 'white'; ctx.stroke();
    }
}

function checkPop() {
    bubbles.forEach((b, i) => {
        if (Math.hypot(b.x - cursor.x, b.y - cursor.y) < b.radius) {
            bubbles.splice(i, 1);
            score += 10;
            document.getElementById('score').innerText = score;
        }
    });
}

function animate() {
    if (!gameActive) return;
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (Math.random() < 0.03) bubbles.push(new Bubble());
    bubbles.forEach((b, i) => {
        b.update(); b.draw();
        if (b.y < -50) bubbles.splice(i, 1);
    });
    if (cursor.active) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cursor.x, cursor.y, 25, 0, Math.PI*2); ctx.stroke();
    }
    if (currentMode === 'multi' && opponentState?.cursor) {
        ctx.strokeStyle = '#a855f7'; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.arc(opponentState.cursor.x, opponentState.cursor.y, 25, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
    }
    requestAnimationFrame(animate);
}

onAuthStateChanged(auth, (u) => {
    if (u) { user = u; document.getElementById('player-id').innerText = u.uid.slice(0, 5); }
    else { signInAnonymously(auth); }
});

window.addEventListener('resize', () => { canvasElement.width = window.innerWidth; canvasElement.height = window.innerHeight; });
canvasElement.width = window.innerWidth; canvasElement.height = window.innerHeight;
updateUI();
