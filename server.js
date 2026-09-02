const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const PI_API_KEY = process.env.PI_API_KEY;
const PI_API_BASE = "https://api.minepi.com/v2";

const MAX_SUPPLY = 1_000_000_000;
const MINING_POOL = 500_000_000;
const MINING_RATE = 1;
const SESSION_MS = 24 * 60 * 60 * 1000;

const users = new Map();
const payments = new Map();

function getUser(wallet) {
  if (!users.has(wallet)) {
    users.set(wallet, {
      wallet,
      balance: 0,
      mined: 0,
      mining: null,
      claims: 0
    });
  }

  return users.get(wallet);
}

function requirePiKey(res) {
  if (!PI_API_KEY) {
    res.status(500).json({
      success: false,
      error: "PI_API_KEY is not configured on the server"
    });
    return false;
  }

  return true;
}

async function piRequest(path, options = {}) {
  const response = await fetch(`${PI_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Key ${PI_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(
      data?.error || data?.message || `Pi API HTTP ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

/* =========================
   HEALTH / SERVER STATUS
========================= */

app.get("/", (req, res) => {
  res.json({
    name: "TT Token Mining",
    symbol: "TT",
    network: "Pi Testnet",
    maxSupply: MAX_SUPPLY,
    miningPool: MINING_POOL,
    status: "Development",
    piApiConfigured: Boolean(PI_API_KEY)
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    server: "online",
    piApiConfigured: Boolean(PI_API_KEY),
    timestamp: new Date().toISOString()
  });
});

/* =========================
   MINING
========================= */

app.post("/api/mining/start", (req, res) => {
  const { wallet } = req.body;

  if (!wallet) {
    return res.status(400).json({
      error: "Wallet address is required"
    });
  }

  const user = getUser(wallet);

  if (user.mining && Date.now() < user.mining.endTime) {
    return res.status(400).json({
      error: "Mining session is already active"
    });
  }

  const startTime = Date.now();
  const endTime = startTime + SESSION_MS;

  user.mining = {
    startTime,
    endTime,
    claimed: false
  };

  res.json({
    success: true,
    wallet,
    startTime,
    endTime,
    rate: MINING_RATE,
    message: "TT mining started"
  });
});

app.get("/api/mining/status/:wallet", (req, res) => {
  const user = getUser(req.params.wallet);

  if (!user.mining) {
    return res.json({
      mining: false,
      balance: user.balance,
      mined: user.mined
    });
  }

  const now = Date.now();

  const elapsed = Math.max(
    0,
    Math.min(now, user.mining.endTime) - user.mining.startTime
  );

  const hours = elapsed / (60 * 60 * 1000);
  const earned = Math.min(hours * MINING_RATE, 24);

  res.json({
    mining: now < user.mining.endTime,
    startTime: user.mining.startTime,
    endTime: user.mining.endTime,
    earned: Number(earned.toFixed(6)),
    balance: user.balance,
    mined: user.mined
  });
});

app.post("/api/mining/claim", (req, res) => {
  const { wallet } = req.body;

  if (!wallet) {
    return res.status(400).json({
      error: "Wallet address is required"
    });
  }

  const user = getUser(wallet);

  if (!user.mining) {
    return res.status(400).json({
      error: "No mining session found"
    });
  }

  if (user.mining.claimed) {
    return res.status(400).json({
      error: "Mining reward already claimed"
    });
  }

  if (Date.now() < user.mining.endTime) {
    return res.status(400).json({
      error: "Mining session is not finished"
    });
  }

  const reward = 24 * MINING_RATE;

  if (user.mined + reward > MINING_POOL) {
    return res.status(400).json({
      error: "Mining pool limit reached"
    });
  }

  user.balance += reward;
  user.mined += reward;
  user.claims += 1;
  user.mining.claimed = true;

  res.json({
    success: true,
    wallet,
    reward,
    balance: user.balance,
    totalMined: user.mined
  });
});

app.get("/api/balance/:wallet", (req, res) => {
  const user = getUser(req.params.wallet);

  res.json({
    wallet: user.wallet,
    balance: user.balance,
    totalMined: user.mined
  });
});

/* =========================
   PI PAYMENT - APPROVAL
========================= */

app.post("/api/payments/approve", async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({
      success: false,
      error: "paymentId is required"
    });
  }

  if (!requirePiKey(res)) {
    return;
  }

  try {
    const payment = await piRequest(
      `/payments/${encodeURIComponent(paymentId)}/approve`,
      {
        method: "POST"
      }
    );

    payments.set(paymentId, {
      paymentId,
      approved: true,
      payment
    });

    console.log(`Pi payment approved: ${paymentId}`);

    return res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error("Pi approval error:", error.data || error.message);

    return res.status(error.status || 500).json({
      success: false,
      error: "Pi payment approval failed",
      details: error.data || error.message
    });
  }
});

/* =========================
   PI PAYMENT - COMPLETION
========================= */

app.post("/api/payments/complete", async (req, res) => {
  const { paymentId, txid } = req.body;

  if (!paymentId || !txid) {
    return res.status(400).json({
      success: false,
      error: "paymentId and txid are required"
    });
  }

  if (!requirePiKey(res)) {
    return;
  }

  try {
    const payment = await piRequest(
      `/payments/${encodeURIComponent(paymentId)}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ txid })
      }
    );

    if (!payment?.status?.developer_completed) {
      return res.status(400).json({
        success: false,
        error: "Pi payment was not confirmed as completed",
        payment
      });
    }

    const previous = payments.get(paymentId) || {};

    payments.set(paymentId, {
      ...previous,
      paymentId,
      completed: true,
      txid,
      payment
    });

    console.log(`Pi payment completed: ${paymentId}`);

    return res.json({
      success: true,
      paymentId,
      txid,
      payment
    });
  } catch (error) {
    console.error("Pi completion error:", error.data || error.message);

    return res.status(error.status || 500).json({
      success: false,
      error: "Pi payment completion failed",
      details: error.data || error.message
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log("////////////////////////////////////////");
  console.log("TT Token server is live");
  console.log(`Port: ${PORT}`);
  console.log(`Pi API configured: ${Boolean(PI_API_KEY)}`);
  console.log("////////////////////////////////////////");
});