
// Shared Firebase init + helpers
// Uses Firestore + Anonymous Auth (compat SDK for simplicity)

// Room selection: use ?room=xyz or default to 'room1'
(function(){
  const params = new URLSearchParams(location.search);
  window.ROOM_ID = params.get('room') || 'room1';
})();

// Scoring constants
window.SCORE_BASE = 100;           // points for correct answer
window.SPEED_BONUS_MAX = 1000;      // max extra for instant correct
window.SPEED_BONUS_WINDOW_MS = 50000; // full bonus at 0ms, linearly to 0 at 50s

// Firebase init
;(function(){
  // Load config from window.FIREBASE_CONFIG
  if(!window.FIREBASE_CONFIG){
    console.error('Missing FIREBASE_CONFIG. Edit firebase-config.js');
  }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  window.db = firebase.firestore();
  window.auth = firebase.auth();
})();

// Auth: sign in anonymously and return UID
// Robust Anonymous sign-in: ไม่คืนก่อนจนกว่าจะได้ user จริง
async function ensureAnon(){
  // ถ้าเคย sign-in แล้ว
  if (auth.currentUser && auth.currentUser.uid) {
    return auth.currentUser.uid;
  }
  try {
    // พยายาม sign-in แบบ Anonymous ตรง ๆ ก่อน
    const cred = await auth.signInAnonymously();
    if (cred && cred.user && cred.user.uid) return cred.user.uid;

    // เผื่อบางบราวเซอร์ delay — รอจนกว่าจะได้ user จริง
    return await new Promise((resolve, reject)=>{
      const timeout = setTimeout(()=>reject(new Error('Auth timeout: no user')), 10000);
      const unsub = auth.onAuthStateChanged(u=>{
        if (u && u.uid) {
          clearTimeout(timeout);
          unsub();
          resolve(u.uid);
        }
      }, err=>{
        clearTimeout(timeout);
        unsub();
        reject(err);
      });
    });
  } catch (e) {
    if (window.showToast) {
      window.showToast('Firebase auth error: ' + e.message + '\\nตรวจ firebase-config.js และเปิด Anonymous sign-in', 'error');
    } else {
      alert('Firebase auth error: ' + e.message + '\\nตรวจ firebase-config.js และเปิด Anonymous sign-in');
    }
    throw e;
  }
}

window.ensureAnon = ensureAnon;

// Firestore refs
function roomRef(){ return db.collection('rooms').doc(window.ROOM_ID); }
function playersCol(){ return roomRef().collection('players'); }
function playerDoc(uid){ return playersCol().doc(uid); }

// Helpers
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
window.shuffle = shuffle;

function computePoints(isCorrect, elapsedMs){
  if(!isCorrect) return 0;
  const bonus = Math.max(0, Math.round(window.SPEED_BONUS_MAX * (1 - (elapsedMs / window.SPEED_BONUS_WINDOW_MS))));
  return window.SCORE_BASE + bonus;
}
window.computePoints = computePoints;

async function resetRoom(){
  // Danger: removes all players in the room
  const snap = await playersCol().get();
  const batch = db.batch();
  snap.forEach(doc=>batch.delete(doc.ref));
  await batch.commit();
  await roomRef().set({ resetAt: firebase.firestore.FieldValue.serverTimestamp() }, {merge:true});
}
window.resetRoom = resetRoom;
