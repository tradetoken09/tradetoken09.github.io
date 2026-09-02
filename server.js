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
const purchases = new Map();

/* =========================
   PET PRICES
========================= */

const PET_PRICES = new Map([
  ["Lunar Owl", 1],
  ["Crystal Hedgehog", 1],
  ["Sky Fox", 1.5],
  ["Rock Turtle", 1],
  ["Storm Squirrel", 1.5],
  ["Dragonfly", 2],
  ["Shadow Scorpion", 2],
  ["Crystal Mantis", 2],
  ["Fire Lizard", 2.5],
  ["Leaf Frog", 1],
  ["Pixie Ant", 1]
]);

/* =========================
   CORS
========================= */

const ALLOWED_ORIGINS = new Set([
  "https://tradetoken09.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

/* =========================
   USER
========================= */

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

/* =========================
   PI API KEY
========================= */

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

/* =========================
   PI API REQUEST
========================= */

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
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    const error = new Error(
      data?.error ||
      data?.message ||
      `Pi API HTTP ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

/* =========================
   VERIFY PI USER
========================= */

async function piUserRequest(accessToken) {
  const response = await fetch(`${PI_API_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    const error = new Error(
      data?.error ||
      data?.message ||
      `Pi /me HTTP ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

/* =========================
   VERIFY PAYMENT USER
========================= */

async function verifyPaymentUser(payment, accessToken, uid) {
  if (!accessToken || !uid) {
    throw Object.assign(
      new Error("Pi user verification data is required"),
      {
        status: 401
      }
    );
  }

  const me = await piUserRequest(accessToken);

  if (!me?.uid || me.uid !== uid) {
    throw Object.assign(
      new Error("Pi user verification failed"),
      {
        status: 401
      }
    );
  }

  if (!payment?.user_uid || payment.user_uid !== me.uid) {
    throw Object.assign(
      new Error(
        "Payment does not belong to the authenticated Pi user"
      ),
      {
        status: 403
      }
    );
  }

  return me;
}

/* =========================
   HEALTH
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
   MINING START
========================= */

app.post("/api/mining/start", (req, res) => {
  const { wallet } = req.body;

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

/* =========================
   MINING STATUS
========================= */

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
    Math.min(
      now,
      user.mining.endTime
    ) - user.mining.startTime
  );

  const hours =
    elapsed / (60 * 60 * 1000);

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
      Number(earned.toFixed(6)),

    balance:
      user.balance,

    mined:
      user.mined
  });
});

/* =========================
   MINING CLAIM
========================= */

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

  if (
    Date.now() <
    user.mining.endTime
  ) {
    return res.status(400).json({
      error: "Mining session is not finished"
    });
  }

  const reward =
    24 * MINING_RATE;

  if (
    user.mined + reward >
    MINING_POOL
  ) {
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

/* =========================
   BALANCE
========================= */

app.get("/api/balance/:wallet", (req, res) => {
  const user =
    getUser(req.params.wallet);

  res.json({
    wallet: user.wallet,
    balance: user.balance,
    totalMined: user.mined
  });
});

/* =========================
   PI PAYMENT APPROVAL
========================= */

app.post(
  "/api/payments/approve",
  async (req, res) => {

    const {
      paymentId,
      uid,
      accessToken
    } = req.body;

    if (
      !paymentId ||
      !uid ||
      !accessToken
    ) {
      return res.status(400).json({
        success: false,
        error:
          "paymentId, uid and accessToken are required"
      });
    }

    if (!requirePiKey(res)) {
      return;
    }

    try {

      const paymentBeforeApproval =
        await piRequest(
          `/payments/${encodeURIComponent(
            paymentId
          )}`
        );

      await verifyPaymentUser(
        paymentBeforeApproval,
        accessToken,
        uid
      );

      if (
        paymentBeforeApproval.direction !==
        "user_to_app"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "This payment is not a User-to-App payment"
        });
      }

      if (
        paymentBeforeApproval.network !==
        "Pi Testnet"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "This TT Token test purchase must use Pi Testnet"
        });
      }

      const metadata =
        paymentBeforeApproval.metadata || {};

      const petName =
        String(metadata.petName || "");

      const expectedPrice =
        PET_PRICES.get(petName);

      const requestedPrice =
        Number(metadata.price);

      if (
        metadata.productType !== "pet" ||
        expectedPrice === undefined
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid TT Token pet purchase"
        });
      }

      if (
        !Number.isFinite(requestedPrice) ||
        requestedPrice !== expectedPrice
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Pet price validation failed"
        });
      }

      if (
        Number(paymentBeforeApproval.amount) !==
        expectedPrice
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Payment amount does not match the pet price"
        });
      }

      if (
        paymentBeforeApproval.status
          ?.developer_completed
      ) {
        return res.json({
          success: true,
          alreadyCompleted: true,
          payment:
            paymentBeforeApproval
        });
      }

      if (
        paymentBeforeApproval.status
          ?.developer_approved
      ) {

        payments.set(
          paymentId,
          {
            paymentId,
            uid,
            petName,
            price: expectedPrice,
            approved: true,
            payment:
              paymentBeforeApproval
          }
        );

        return res.json({
          success: true,
          alreadyApproved: true,
          payment:
            paymentBeforeApproval
        });
      }

      const payment =
        await piRequest(
          `/payments/${encodeURIComponent(
            paymentId
          )}/approve`,
          {
            method: "POST"
          }
        );

      payments.set(
        paymentId,
        {
          paymentId,
          uid,
          petName,
          price: expectedPrice,
          approved: true,
          payment
        }
      );

      console.log(
        `Pi payment approved: ${paymentId} | ${petName} | ${expectedPrice} Test-Pi`
      );

      return res.json({
        success: true,
        payment
      });

    } catch (error) {

      console.error(
        "Pi approval error:",
        error.data ||
        error.message
      );

      return res.status(
        error.status || 500
      ).json({
        success: false,
        error:
          error.message ||
          "Pi payment approval failed"
      });
    }
  }
);

/* =========================
   PI PAYMENT COMPLETION
========================= */

app.post(
  "/api/payments/complete",
  async (req, res) => {

    const {
      paymentId,
      txid,
      uid,
      accessToken
    } = req.body;

    if (
      !paymentId ||
      !txid ||
      !uid ||
      !accessToken
    ) {
      return res.status(400).json({
        success: false,
        error:
          "paymentId, txid, uid and accessToken are required"
      });
    }

    if (!requirePiKey(res)) {
      return;
    }

    try {

      const paymentBeforeCompletion =
        await piRequest(
          `/payments/${encodeURIComponent(
            paymentId
          )}`
        );

      await verifyPaymentUser(
        paymentBeforeCompletion,
        accessToken,
        uid
      );

      const saved =
        payments.get(paymentId);

      const metadata =
        paymentBeforeCompletion.metadata ||
        {};

      const petName =
        String(
          metadata.petName ||
          saved?.petName ||
          ""
        );

      const expectedPrice =
        PET_PRICES.get(petName);

      if (
        metadata.productType !== "pet" ||
        expectedPrice === undefined
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid TT Token pet purchase"
        });
      }

      if (
        Number(
          paymentBeforeCompletion.amount
        ) !== expectedPrice
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Payment amount does not match the pet price"
        });
      }

      if (
        !paymentBeforeCompletion.status
          ?.developer_approved
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Payment has not been approved yet"
        });
      }

      if (
        paymentBeforeCompletion.status
          ?.developer_completed
      ) {

        const existingPurchase =
          purchases.get(paymentId);

        return res.json({
          success: true,
          alreadyCompleted: true,
          paymentId,
          txid:
            paymentBeforeCompletion
              .transaction
              ?.txid || txid,

          pet:
            existingPurchase || {
              name: petName,
              price: expectedPrice,
              uid
            },

          payment:
            paymentBeforeCompletion
        });
      }

      const payment =
        await piRequest(
          `/payments/${encodeURIComponent(
            paymentId
          )}/complete`,
          {
            method: "POST",
            body: JSON.stringify({
              txid
            })
          }
        );

      if (
        !payment?.status
          ?.developer_completed
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Pi payment was not confirmed as completed",
          payment
        });
      }

      const purchase = {
        paymentId,
        uid,
        petName,
        price: expectedPrice,
        txid,
        purchasedAt:
          new Date().toISOString()
      };

      payments.set(
        paymentId,
        {
          ...(saved || {}),
          paymentId,
          uid,
          petName,
          price: expectedPrice,
          completed: true,
          txid,
          payment
        }
      );

      purchases.set(
        paymentId,
        purchase
      );

      console.log(
        `Pi payment completed: ${paymentId} | ${petName} | ${txid}`
      );

      return res.json({
        success: true,
        paymentId,
        txid,
        pet: purchase,
        payment
      });

    } catch (error) {

      console.error(
        "Pi completion error:",
        error.data ||
        error.message
      );

      return res.status(
        error.status || 500
      ).json({
        success: false,
        error:
          error.message ||
          "Pi payment completion failed"
      });
    }
  }
);

/* =========================
   PI PAYMENT CANCEL
========================= */

app.post(
  "/api/payments/cancel",
  async (req, res) => {

    const {
      paymentId,
      uid,
      accessToken
    } = req.body;

    if (
      !paymentId ||
      !uid ||
      !accessToken
    ) {
      return res.status(400).json({
        success: false,
        error:
          "paymentId, uid and accessToken are required"
      });
    }

    if (!requirePiKey(res)) {
      return;
    }

    try {

      const payment =
        await piRequest(
          `/payments/${encodeURIComponent(
            paymentId
          )}`
        );

      await verifyPaymentUser(
        payment,
        accessToken,
        uid
      );

      const cancelled =
        await piRequest(
          `/payments/${encodeURIComponent(
            paymentId
          )}/cancel`,
          {
            method: "POST"
          }
        );

      payments.set(
        paymentId,
        {
          ...(payments.get(paymentId) || {}),
          paymentId,
          cancelled: true,
          payment: cancelled
        }
      );

      return res.json({
        success: true,
        payment: cancelled
      });

    } catch (error) {

      console.error(
        "Pi cancellation error:",
        error.data ||
        error.message
      );

      return res.status(
        error.status || 500
      ).json({
        success: false,
        error:
          error.message ||
          "Pi payment cancellation failed"
      });
    }
  }
);

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

  console.log(
    "////////////////////////////////////////"
  );

  console.log(
    "TT Token server is live"
  );

  console.log(
    `Port: ${PORT}`
  );

  console.log(
    `Pi API configured: ${Boolean(
      PI_API_KEY
    )}`
  );

  console.log(
    "////////////////////////////////////////"
  );
});