// ============================================================
// SHURWAT SMM - HEAVY BACKEND SERVER (FASTEST)
// Node.js + Express + Firebase Admin + In-Memory Heavy Cache
// Deploy: Render / Railway / VPS - 1 click
// ============================================================
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- 1. HEAVY SETUP ----------
app.use(cors({ origin: '*' }));
app.use(compression()); // GZIP - data 70% chota = fast
app.use(express.json({ limit: '2mb' }));

// ---------- 2. FIREBASE ADMIN (Server side = FAST, secure) ----------
// Render/Railway me Env Var lagao:
// FIREBASE_SERVICE_ACCOUNT = poora serviceAccount JSON (ek line me)
// FIREBASE_DB_URL = https://shurwat-3c60e-default-rtdb.firebaseio.com
let db = null;
try {
  const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (svc.private_key) {
    svc.private_key = svc.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert(svc),
      databaseURL: process.env.FIREBASE_DB_URL || 'https://shurwat-3c60e-default-rtdb.firebaseio.com'
    });
    db = admin.database();
    console.log('✅ Firebase Admin Connected - HEAVY MODE');
  } else {
    console.log('⚠️ No Service Account - running in CACHE-ONLY mode, set FIREBASE_SERVICE_ACCOUNT');
  }
} catch(e){ console.log('Firebase init error:', e.message); }

// ---------- 3. HEAVY CACHE (Server RAM = 0ms) ----------
// Users / Services ko RAM me rakho, har baar Firebase mat chhero
const cache = {
  usersByName: new Map(), // name_lower -> {uid,email,name}
  usersByUid: new Map(),
  services: null,
  servicesTime: 0,
  cats: null,
  stats: null,
  statsTime: 0,
};
const CACHE_TTL_SERVICES = 30 * 1000; // 30 sec
const CACHE_TTL_STATS = 15 * 1000;

function keyName(name){ return String(name||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_'); }
function setCacheHeaders(res, sec=30){ res.set('Cache-Control', `public, max-age=${sec}`); }

// Pre-load cache on boot - server start hote hi data RAM me
async function warmCache(){
  if(!db) return;
  try{
    const [uSnap, sSnap, cSnap] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('services').once('value'),
      db.ref('categories').once('value'),
    ]);
    const users = uSnap.val()||{};
    for(const [uid,u] of Object.entries(users)){
      if(u.name){ cache.usersByName.set(keyName(u.name), {uid, email:u.email, name:u.name}); cache.usersByUid.set(uid,u); }
    }
    cache.services = sSnap.val()||{};
    cache.servicesTime = Date.now();
    cache.cats = cSnap.val()||{};
    console.log(`🔥 Cache Warmed: ${cache.usersByName.size} users, ${Object.keys(cache.services).length} services`);
  }catch(e){ console.log('warmCache error', e.message); }
}
// Live sync - Firebase me kuch badle to cache bhi update (real-time, no polling)
function startLiveSync(){
  if(!db) return;
  db.ref('users').on('child_added', s=>{ const u=s.val(); if(u?.name){ cache.usersByName.set(keyName(u.name), {uid:s.key, email:u.email, name:u.name}); cache.usersByUid.set(s.key,u);} });
  db.ref('users').on('child_changed', s=>{ const u=s.val(); if(u?.name){ cache.usersByName.set(keyName(u.name), {uid:s.key, email:u.email, name:u.name}); cache.usersByUid.set(s.key,u);} });
  db.ref('services').on('value', s=>{ cache.services=s.val()||{}; cache.servicesTime=Date.now(); });
  db.ref('categories').on('value', s=>{ cache.cats=s.val()||{}; });
  console.log('⚡ Live Sync ON - cache hamesha fresh');
}

// ---------- 4. HEALTH + PING (for Render keep-alive) ----------
app.get('/', (req,res)=>res.json({status:'SHURWAT HEAVY SERVER RUNNING 🔥', uptime:process.uptime(), cachedUsers:cache.usersByName.size}));
app.get('/ping', (req,res)=>res.json({ok:true, time:Date.now()}));

// ---------- 5. FAST AUTH - LOGIN BY NAME (0ms if cached) ----------
app.post('/api/auth/login', async (req,res)=>{
  try{
    const {name, password} = req.body||{};
    if(!name || !password) return res.status(400).json({error:'Enter Name and Password'});
    const found = cache.usersByName.get(keyName(name));
    if(!found){
      // Cache miss - 1 hi baar Firebase se lo, phir cache me daal do
      if(!db) return res.status(404).json({error:'Name not found. Please Sign Up first.'});
      const snap = await db.ref('userNames/'+keyName(name)).once('value');
      if(!snap.exists()){
        const snap2 = await db.ref('users').orderByChild('name').equalTo(name).once('value');
        if(!snap2.exists()) return res.status(404).json({error:'Name not found. Please Sign Up first.'});
        const [uid,u] = Object.entries(snap2.val())[0];
        cache.usersByName.set(keyName(name), {uid, email:u.email, name:u.name});
        return res.json({email:u.email, uid, name:u.name, from:'db-fallback'});
      }
      const v = snap.val();
      cache.usersByName.set(keyName(name), {uid:v.uid, email:v.email, name:v.name});
      return res.json({email:v.email, uid:v.uid, name:v.name, from:'db-index'});
    }
    // Cache HIT = fastest
    return res.json({email:found.email, uid:found.uid, name:found.name, from:'cache-0ms'});
  }catch(e){ console.log('login error', e.message); return res.status(500).json({error:'Server error. Try again.'}); }
});

// ---------- 6. FAST SIGNUP ----------
app.post('/api/auth/signup', async (req,res)=>{
  try{
    const {name, email, password} = req.body||{};
    if(!name || !email || !password) return res.status(400).json({error:'Fill all fields'});
    if(!db) return res.status(500).json({error:'Server not connected to Firebase. Set Service Account.'});
    // 1. Auth user banao (server side - fast)
    let user;
    try{ user = await admin.auth().createUser({email, password, displayName:name}); }
    catch(e){
      if(e.code==='auth/email-already-exists') return res.status(400).json({error:'This Gmail is already registered. Please Login.'});
      return res.status(400).json({error:e.message});
    }
    // 2. DB me 3 jagah parallel write - ek saath, wait nahi
    const k = keyName(name);
    await Promise.all([
      db.ref('users/'+user.uid).set({name, email, phone:'', balance:0, status:'active', createdAt:Date.now(), role:'user'}),
      db.ref('userNames/'+k).set({uid:user.uid, email, name}),
    ]);
    cache.usersByName.set(k, {uid:user.uid, email, name});
    cache.usersByUid.set(user.uid, {name, email, balance:0});
    return res.json({ok:true, uid:user.uid, email, name});
  }catch(e){ console.log('signup error', e.message); return res.status(500).json({error:'Server error. Try again.'}); }
});

// ---------- 7. FAST SERVICES (cached 30 sec) ----------
app.get('/api/services', (req,res)=>{
  setCacheHeaders(res, 30);
  if(cache.services && (Date.now()-cache.servicesTime < CACHE_TTL_SERVICES)){
    return res.json({services:cache.services, categories:cache.cats, from:'cache'});
  }
  if(!db) return res.json({services:{}, categories:{}});
  db.ref('services').once('value').then(s=>{
    cache.services=s.val()||{}; cache.servicesTime=Date.now();
    return res.json({services:cache.services, categories:cache.cats, from:'db'});
  }).catch(()=>res.json({services:{}, categories:{}}));
});

// ---------- 8. FAST STATS FOR ADMIN (cached 15 sec) ----------
app.get('/api/admin/stats', async (req,res)=>{
  if(cache.stats && (Date.now()-cache.statsTime < CACHE_TTL_STATS)) return res.json({...cache.stats, from:'cache'});
  if(!db) return res.json({users:0, orders:0});
  try{
    const [u,o,d] = await Promise.all([
      db.ref('users').once('value'),
      db.ref('orders').once('value'),
      db.ref('deposits').once('value'),
    ]);
    const users=u.val()||{}, orders=o.val()||{}, deposits=d.val()||{};
    const stats={ users:Object.keys(users).length, orders:Object.keys(orders).length, deposits:Object.keys(deposits).length, pendingOrders:Object.values(orders).filter(x=>x.status==='Pending').length, pendingDeposits:Object.values(deposits).filter(x=>x.status==='Pending').length, totalRevenue:Object.values(orders).filter(x=>x.status!=='Cancelled').reduce((a,x)=>a+(x.totalPrice||0),0) };
    cache.stats=stats; cache.statsTime=Date.now();
    return res.json({...stats, from:'db'});
  }catch(e){ return res.status(500).json({error:'Stats error'}); }
});

// ---------- 9. ADMIN: CLEAR CACHE (jab service change ho) ----------
app.post('/api/cache/clear', (req,res)=>{
  cache.services=null; cache.stats=null;
  warmCache();
  return res.json({ok:true, msg:'Cache cleared + rewarmed'});
});

// ---------- 10. START ----------
app.listen(PORT, async ()=>{
  console.log(`🚀 SHURWAT HEAVY SERVER running on port ${PORT}`);
  await warmCache();
  startLiveSync();
  // Keep-alive: har 10 min khud ko ping (Render free tier soye na)
  setInterval(()=>{ fetch(`http://localhost:${PORT}/ping`).catch(()=>{}); }, 10*60*1000);
});
