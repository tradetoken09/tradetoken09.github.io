const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const MAX_SUPPLY = 1_000_000_000;
const MINING_POOL = 500_000_000;
const MINING_RATE = 1; // TT per hour
const SESSION_MS = 24 * 60 * 60 * 1000;

// Testnet database for now.
// Replace with PostgreSQL/MongoDB for production.
const users = new Map();

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

// Start a 24-hour mining session
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

// Check mining status
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

// Claim completed mining reward
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

// User balance
app.get("/api/balance/:wallet", (req, res) => {
  const user = getUser(req.params.wallet);

  res.json({
    wallet: user.wallet,
    balance: user.balance,
    totalMined: user.mined
  });
});

app.get("/", (req, res) => {
  res.json({
    name: "TT Token Mining",
    symbol: "TT",
    network: "Pi Testnet",
    maxSupply: MAX_SUPPLY,
    miningPool: MINING_POOL,
    status: "Development"
  });
});

app.listen(PORT, () => {
  console.log(`TT Mining server running on port ${PORT}`);
});