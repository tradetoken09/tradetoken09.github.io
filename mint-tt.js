"use strict";

require("dotenv").config();

const StellarSDK = require("@stellar/stellar-sdk");

const ISSUER_SECRET = process.env.TT_ISSUER_SECRET;
const DISTRIBUTOR_SECRET = process.env.TT_DISTRIBUTOR_SECRET;

const EXPECTED_ISSUER =
  process.env.TT_ISSUER_PUBLIC;

const EXPECTED_DISTRIBUTOR =
  process.env.TT_DISTRIBUTOR_PUBLIC;

if (!ISSUER_SECRET || !DISTRIBUTOR_SECRET) {
  throw new Error(
    "Missing TT_ISSUER_SECRET or TT_DISTRIBUTOR_SECRET"
  );
}

if (!EXPECTED_ISSUER || !EXPECTED_DISTRIBUTOR) {
  throw new Error(
    "Missing TT_ISSUER_PUBLIC or TT_DISTRIBUTOR_PUBLIC"
  );
}

const issuerKeypair =
  StellarSDK.Keypair.fromSecret(ISSUER_SECRET);

const distributorKeypair =
  StellarSDK.Keypair.fromSecret(DISTRIBUTOR_SECRET);

const issuerPublic = issuerKeypair.publicKey();
const distributorPublic = distributorKeypair.publicKey();

console.log("===== TT WALLET VALIDATION =====");

console.log("Issuer:", issuerPublic);
console.log("Distributor:", distributorPublic);

if (issuerPublic !== EXPECTED_ISSUER) {
  throw new Error(
    "Issuer secret does NOT match TT_ISSUER_PUBLIC"
  );
}

if (distributorPublic !== EXPECTED_DISTRIBUTOR) {
  throw new Error(
    "Distributor secret does NOT match TT_DISTRIBUTOR_PUBLIC"
  );
}

console.log("Issuer key: OK");
console.log("Distributor key: OK");
console.log("Both wallet keys match their public addresses.");
console.log("================================");