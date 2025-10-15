/**
 * index.js - 미니 블록체인 서버 (데모용)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

// --- 미들웨어 ---
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});
app.use(express.static('public'));

const CHAIN_FILE = path.join(__dirname, 'chain.json');

function computeBlockHash(index, timestamp, docHash, prevHash) {
  return crypto.createHash('sha256').update(`${index}|${timestamp}|${docHash}|${prevHash}`).digest('hex');
}

function loadChain() {
  if (fs.existsSync(CHAIN_FILE)) {
    try { return JSON.parse(fs.readFileSync(CHAIN_FILE,'utf8')); } 
    catch(e) { fs.copyFileSync(CHAIN_FILE, CHAIN_FILE + '.corrupt.' + Date.now()); }
  }
  const ts = new Date().toISOString();
  const genesis = [{
    index:0,
    timestamp:ts,
    docHash:'GENESIS',
    metadata:{note:'Genesis'},
    prevHash:'0'.repeat(64),
    hash:computeBlockHash(0,ts,'GENESIS','0'.repeat(64))
  }];
  fs.writeFileSync(CHAIN_FILE, JSON.stringify(genesis, null, 2));
  return genesis;
}

function saveChain(chain) { fs.writeFileSync(CHAIN_FILE, JSON.stringify(chain, null, 2)); }

// --- API 라우트들 ---
app.get('/chain', (req, res) => res.json(loadChain()));

app.post('/add', (req, res) => {
  const { docHash, metadata } = req.body;
  if (!docHash) return res.status(400).json({ error: 'docHash required' });
  const chain = loadChain();
  const prev = chain[chain.length-1];
  const index = prev.index + 1;
  const ts = new Date().toISOString();
  const hash = computeBlockHash(index, ts, docHash, prev.hash);
  const block = { index, timestamp:ts, docHash, metadata:metadata||{}, prevHash:prev.hash, hash };
  chain.push(block); saveChain(chain);
  res.json({ success:true, block });
});

app.post('/reset', (req,res) => { if (fs.existsSync(CHAIN_FILE)) fs.unlinkSync(CHAIN_FILE); res.json({ success:true, chain: loadChain() }); });

// --- 체인 무결성 검사 함수 & 엔드포인트 ---
function validateChain(chain) {
  const errors = [];
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const cur = chain[i];

    if (cur.prevHash !== prev.hash) {
      errors.push(`Block ${cur.index}: prevHash does not match index ${prev.index} hash`);
    }

    const recomputed = computeBlockHash(cur.index, cur.timestamp, cur.docHash, cur.prevHash);
    if (recomputed !== cur.hash) {
      errors.push(`Block ${cur.index}: hash mismatch (stored vs recomputed)`);
    }
  }
  return { valid: errors.length === 0, errors };
}

app.get('/verify-chain', (req, res) => {
  const chain = loadChain();
  const result = validateChain(chain);
  res.json(result);
});

app.post('/verify-doc', (req, res) => {
  const { docHash } = req.body;
  if (!docHash) return res.status(400).json({ error: 'docHash required' });

  const chain = loadChain();
  const found = chain.find(b => b.docHash === docHash);
  if (found) return res.json({ found: true, block: found });
  return res.json({ found: false });
});

// --- 서버 시작 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on http://localhost:' + PORT));

