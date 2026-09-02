// 1. Initialize Pi SDK sa Sandbox / Testnet mode
const Pi = window.Pi;

// State Variables
let currentBalance = 0.00;
let isMining = false;
let miningInterval = null;
let currentUsername = "";

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
  initPiSDK();
  setupEventListeners();
});

// 2. Pi Authentication Logic
async function initPiSDK() {
  try {
    Pi.init({ version: "2.0", sandbox: true });

    const scopes = ['username', 'payments'];
    
    function onIncompletePaymentFound(payment) {
      console.log("Incomplete payment found:", payment);
    }

    // Authenticate user sa Pi Browser
    const auth = await Pi.authenticate(scopes, onIncompletePaymentFound);
    currentUsername = auth.user.username;

    // Update UI sa Pi Username
    document.getElementById('username').innerText = "@" + currentUsername;
    document.getElementById('invite').innerText = "TT-" + currentUsername.toUpperCase();
    console.log("Authenticated as:", currentUsername);

  } catch (error) {
    console.error("Pi Authentication error:", error);
    document.getElementById('username').innerText = "Not Connected (Open in Pi Browser)";
  }
}

// 3. Event Listeners para sa mga Pindutan
function setupEventListeners() {
  const mineBtn = document.getElementById('mineBtn');
  const claimBtn = document.getElementById('claimBtn');
  const buyBtn = document.getElementById('buyBtn');

  // Start Mining Button
  if (mineBtn) {
    mineBtn.addEventListener('click', () => {
      if (!isMining) {
        startMining();
      } else {
        alert("Mining is already active!");
      }
    });
  }

  // Claim TT Button
  if (claimBtn) {
    claimBtn.addEventListener('click', () => {
      if (currentBalance > 0) {
        alert(`Successfully claimed ${currentBalance.toFixed(2)} TT Tokens to your test balance!`);
        currentBalance = 0.00;
        updateBalanceDisplay();
      } else {
        alert("No TT tokens available to claim yet. Start mining first!");
      }
    });
  }

  // Test Buy Marketplace Button (Pi Payment Demo)
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      if (!currentUsername) {
        alert("Please authenticate via Pi Browser first.");
        return;
      }
      
      // Simple Test Payment Simulation
      alert("Test Buy functionality: Pi Payment SDK Integration is ready for Sandbox Testing!");
    });
  }
}

// 4. Mining Logic Functions
function startMining() {
  isMining = true;
  document.getElementById('status').innerText = "Mining is active... (+0.24 TT/hr)";
  document.getElementById('mineBtn').innerText = "⛏ Mining...";
  document.getElementById('mineBtn').style.opacity = "0.7";

  // Dadagdag ng 0.0000667 TT bawat segundo (katumbas ng 0.24 TT bawat oras)
  miningInterval = setInterval(() => {
    currentBalance += 0.0000667;
    updateBalanceDisplay();
  }, 1000);
}

function updateBalanceDisplay() {
  const balanceElement = document.getElementById('balance');
  if (balanceElement) {
    balanceElement.innerText = currentBalance.toFixed(4) + " TT";
  }
}