const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// =====================================================
// PI CONFIGURATION
// =====================================================

const PI_API_BASE = "https://api.minepi.com/v2";
const PI_API_KEY = process.env.PI_API_KEY;

// =====================================================
// TT TOKEN / MINING CONFIGURATION
// =====================================================

const MAX_SUPPLY = 1_000_000_000;
const MINING_POOL = 500_000_000;

const MINING_RATE = 1;
const SESSION_MS = 24 * 60 * 60 * 1000;

// Temporary database for testing
const users = new Map();

// =====================================================
// GET USER
// =====================================================

function getUser(wallet) {
  if (!users.has(wallet)) {
    users.set(wallet, {
      wallet: wallet,
      balance: 0,
      mined: 0,
      mining: null,
      claims: 0
    });
  }

  return users.get(wallet);
}

// =====================================================
// CORS
// =====================================================

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");

  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// =====================================================
// PI API REQUEST
// =====================================================

async function piRequest(endpoint, options = {}) {
  if (!PI_API_KEY) {
    throw new Error(
      "PI_API_KEY is not configured on the server."
    );
  }

  const response = await fetch(
    `${PI_API_BASE}${endpoint}`,
    {
      ...options,

      headers: {
        "Authorization": `Key ${PI_API_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    const error = new Error(
      data.error ||
      data.message ||
      `Pi API error ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "TT Token Backend",
    network: "Pi Testnet",
    piApiConfigured: Boolean(PI_API_KEY),
    status: "ONLINE"
  });
});

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
  res.json({
    name: "TT Token Mining",
    symbol: "TT",
    network: "Pi Testnet",
    maxSupply: MAX_SUPPLY,
    miningPool: MINING_POOL,
    status: "Development",
    paymentSystem: "Pi User-to-App"
  });
});

// =====================================================
// VERIFY PI USER
// =====================================================

app.post("/api/pi/verify", async (req, res) => {
  try {
    const {
      accessToken
    } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: "Pi access token is required."
      });
    }

    const response = await fetch(
      `${PI_API_BASE}/me`,
      {
        method: "GET",

        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          data.error ||
          "Pi user verification failed."
      });
    }

    res.json({
      success: true,
      user: data
    });

  } catch (error) {

    console.error(
      "Pi verification error:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Pi verification failed."
    });
  }
});

// =====================================================
// START MINING
// =====================================================

app.post("/api/mining/start", (req, res) => {
  const {
    wallet
  } = req.body;

  if (!wallet) {
    return res.status(400).json({
      error: "Wallet address is required"
    });
  }

  const user = getUser(wallet);

  if (
    user.mining &&
    Date.now() < user.mining.endTime
  ) {
    return res.status(400).json({
      error:
        "Mining session is already active"
    });
  }

  const startTime = Date.now();

  const endTime =
    startTime + SESSION_MS;

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

// =====================================================
// MINING STATUS
// =====================================================

app.get(
  "/api/mining/status/:wallet",
  (req, res) => {

    const user =
      getUser(req.params.wallet);

    if (!user.mining) {
      return res.json({
        mining: false,
        balance: user.balance,
        mined: user.mined
      });
    }

    const now = Date.now();

    const elapsed =
      Math.max(
        0,
        Math.min(
          now,
          user.mining.endTime
        ) -
        user.mining.startTime
      );

    const hours =
      elapsed /
      (60 * 60 * 1000);

    const earned =
      Math.min(
        hours * MINING_RATE,
        24
      );

    res.json({
      mining:
        now < user.mining.endTime,

      startTime:
        user.mining.startTime,

      endTime:
        user.mining.endTime,

      earned:
        Number(
          earned.toFixed(6)
        ),

      balance:
        user.balance,

      mined:
        user.mined
    });
  }
);

// =====================================================
// MINING CLAIM
// =====================================================

app.post(
  "/api/mining/claim",
  (req, res) => {

    const {
      wallet
    } = req.body;

    if (!wallet) {
      return res.status(400).json({
        error:
          "Wallet address is required"
      });
    }

    const user =
      getUser(wallet);

    if (!user.mining) {
      return res.status(400).json({
        error:
          "No mining session found"
      });
    }

    if (user.mining.claimed) {
      return res.status(400).json({
        error:
          "Mining reward already claimed"
      });
    }

    if (
      Date.now() <
      user.mining.endTime
    ) {
      return res.status(400).json({
        error:
          "Mining session is not finished"
      });
    }

    const reward =
      24 * MINING_RATE;

    if (
      user.mined + reward >
      MINING_POOL
    ) {
      return res.status(400).json({
        error:
          "Mining pool limit reached"
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
      balance:
        user.balance,
      totalMined:
        user.mined
    });
  }
);

// =====================================================
// USER BALANCE
// =====================================================

app.get(
  "/api/balance/:wallet",
  (req, res) => {

    const user =
      getUser(req.params.wallet);

    res.json({
      wallet:
        user.wallet,

      balance:
        user.balance,

      totalMined:
        user.mined
    });
  }
);

// =====================================================
// PI PAYMENT - SERVER APPROVAL
// =====================================================

app.post(
  "/api/payments/approve",
  async (req, res) => {

    try {

      const {
        paymentId
      } = req.body;

      if (!paymentId) {
        return res.status(400).json({
          success: false,
          error:
            "paymentId is required."
        });
      }

      console.log(
        `PAYMENT APPROVAL: ${paymentId}`
      );

      const payment =
        await piRequest(
          `/payments/${encodeURIComponent(
            paymentId
          )}/approve`,
          {
            method: "POST"
          }
        );

      console.log(
        "PI PAYMENT APPROVED"
      );

      res.json({
        success: true,
        payment
      });

    } catch (error) {

      console.error(
        "Payment approval error:",
        error
      );

      res.status(
        error.status || 500
      ).json({
        success: false,

        error:
          error.message ||
          "Payment approval failed.",

        details:
          error.data || null
      });
    }
  }
);

// =====================================================
// PI PAYMENT - SERVER COMPLETION
// =====================================================

app.post(
  "/api/payments/complete",
  async (req, res) => {

    try {

      const {
        paymentId,
        txid
      } = req.body;

      if (!paymentId) {
        return res.status(400).json({
          success: false,
          error:
            "paymentId is required."
        });
      }

      if (!txid) {
        return res.status(400).json({
          success: false,
          error:
            "txid is required."
        });
      }

      console.log(
        `PAYMENT COMPLETION: ${paymentId}`
      );

      console.log(
        `TRANSACTION: ${txid}`
      );

      const payment =
        await piRequest(
          `/payments/${encodeURIComponent(
            paymentId
          )}/complete`,
          {
            method: "POST",

            body:
              JSON.stringify({
                txid: txid
              })
          }
        );

      console.log(
        "PI PAYMENT COMPLETED"
      );

      res.json({
        success: true,
        payment
      });

    } catch (error) {

      console.error(
        "Payment completion error:",
        error
      );

      res.status(
        error.status || 500
      ).json({
        success: false,

        error:
          error.message ||
          "Payment completion failed.",

        details:
          error.data || null
      });
    }
  }
);

// =====================================================
// CHECK PAYMENT
// =====================================================

app.get(
  "/api/payments/:paymentId",
  async (req, res) => {

    try {

      const payment =
        await piRequest(
          `/payments/${encodeURIComponent(
            req.params.paymentId
          )}`,
          {
            method: "GET"
          }
        );

      res.json({
        success: true,
        payment
      });

    } catch (error) {

      console.error(
        "Payment status error:",
        error
      );

      res.status(
        error.status || 500
      ).json({
        success: false,
        error:
          error.message ||
          "Unable to retrieve payment."
      });
    }
  }
);

// =====================================================
// INCOMPLETE PAYMENTS
// =====================================================

app.get(
  "/api/payments/incomplete",
  async (req, res) => {

    try {

      const payments =
        await piRequest(
          "/payments/incomplete_server_payments",
          {
            method: "GET"
          }
        );

      res.json({
        success: true,
        payments
      });

    } catch (error) {

      console.error(
        "Incomplete payment error:",
        error
      );

      res.status(
        error.status || 500
      ).json({
        success: false,

        error:
          error.message ||
          "Unable to retrieve incomplete payments."
      });
    }
  }
);

// =====================================================
// START SERVER
// =====================================================

app.listen(
  PORT,
  () => {

    console.log(
      `TT Token server running on port ${PORT}`
    );

    console.log(
      `Pi API: ${PI_API_BASE}`
    );

    console.log(
      `Pi API Key configured: ${
        PI_API_KEY ? "YES" : "NO"
      }`
    );
  }
);