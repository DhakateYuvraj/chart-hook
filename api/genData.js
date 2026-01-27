import fs from "fs";
import speakeasy from "speakeasy";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const Api = require("../lib/RestApi.cjs");

const STOCKS = [
  "ABB",
  "ADANIENSOL",
  "ADANIENT",
  "ADANIGREEN",
  "ADANIPORTS",
  "ADANIPOWER",
  "AMBUJACEM",
  "APOLLOHOSP",
  "ASIANPAINT",
  "DMART",
  "AXISBANK",
  "BAJAJ-AUTO",
  "BAJFINANCE",
  "BAJAJFINSV",
  "BAJAJHLDNG",
  "BAJAJHFL",
  "BANKBARODA",
  "BEL",
  "BPCL",
  "BHARTIARTL",
  "BOSCHLTD",
  "BRITANNIA",
  "CGPOWER",
  "CANBK",
  "CHOLAFIN",
  "CIPLA",
  "COALINDIA",
  "DLF",
  "DIVISLAB",
  "DRREDDY",
  "EICHERMOT",
  "ETERNAL",
  "GAIL",
  "GODREJCP",
  "GRASIM",
  "HCLTECH",
  "HDFCBANK",
  "HDFCLIFE",
  "HAVELLS",
  "HINDALCO",
  "HAL",
  "HINDUNILVR",
  "HINDZINC",
  "HYUNDAI",
  "ICICIBANK",
  "ICICIGI",
  "ITC",
  "INDHOTEL",
  "IOC",
  "IRFC",
  "NAUKRI",
  "INFY",
  "INDIGO",
  "JSWENERGY",
  "JSWSTEEL",
  "JINDALSTEL",
  "JIOFIN",
  "KOTAKBANK",
  "LTIM",
  "LT",
  "LICI",
  "LODHA",
  "MARUTI",
  "MAXHEALTH",
  "MAZDOCK",
  "NTPC",
  "NESTLEIND",
  "ONGC",
  "PIDILITIND",
  "PFC",
  "POWERGRID",
  "PNB",
  "RECLTD",
  "RELIANCE",
  "SBILIFE",
  "MOTHERSON",
  "SHREECEM",
  "SHRIRAMFIN",
  "ENRIN",
  "SIEMENS",
  "SOLARINDS",
  "SBIN",
  "SUNPHARMA",
  "TVSMOTOR",
  "TCS",
  "TATACONSUM",
  "TMPV",
  "TATAPOWER",
  "TATASTEEL",
  "TECHM",
  "TITAN",
  "TORNTPHARM",
  "TRENT",
  "ULTRACEMCO",
  "UNITDSPR",
  "VBL",
  "VEDL",
  "WIPRO",
  "ZYDUSLIFE",
];

const authParamsString = process.env.SHOONYA_USER;

let authparams = {};

try {
  authparams = JSON.parse(authParamsString);
} catch (error) {
  console.log("Error in reading SHOONYA_USER", error);
}

const getTodayStockFile = () => {
  const now = new Date();
  const datePart = now.toISOString().split("T")[0].replace(/-/g, "");
  return `stock_tokens_${datePart}.json`;
};

// 20 requests / second => 50ms per request
const RATE_LIMIT_MS = 50;

let lastApiCallTime = 0;

const rateLimitedCall = async (fn) => {
  const now = Date.now();
  const waitTime = Math.max(0, RATE_LIMIT_MS - (now - lastApiCallTime));

  if (waitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastApiCallTime = Date.now();

  try {
    return await fn();
  } catch (err) {
    throw err; // rethrow, but now it's properly awaited
  }
};


const placeOrder = async (payload, userAuthParams, res) => {
  try {
    // =============================
    // CHECK CACHE FIRST
    // =============================
    const filename = getTodayStockFile();

    if (fs.existsSync(filename)) {
      const cachedData = JSON.parse(fs.readFileSync(filename, "utf-8"));
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).json({
        success: true,
        source: "cache",
        data: cachedData,
      });
    }

    // =============================
    // LOGIN
    // =============================
    const twoFA = speakeasy.totp({
      secret: userAuthParams.totp_key,
      encoding: "base32",
      time: Math.floor(Date.now() / 1000),
    });

    const api = new Api({});
    await rateLimitedCall(() => api.logout());

    const loginResp = await rateLimitedCall(() =>
      api.login({ ...userAuthParams, twoFA }),
    );

    if (!loginResp || loginResp.stat !== "Ok") {
      throw new Error(loginResp?.emsg || "Login failed");
    }

    console.log("✅ Login success");

    // =============================
    // PROCESS STOCKS
    // =============================
    const dataToSave = {};
    const results = [];

    const startTime = Date.now();

    await Promise.all(
      STOCKS.map(async (stock) => {
        try {
          // 1️⃣ search scrip
          const searchReply = await rateLimitedCall(() =>
            api.searchscrip("NSE", `${stock}-EQ`),
          );

          const { tsym = "", token = "" } = searchReply?.values?.[0] || {};
          if (!token) throw new Error("Token not found");

          // 2️⃣ get quote
          const quoteReply = await rateLimitedCall(() =>
            api.get_quotes("NSE", token),
          );

          const lp = quoteReply?.lp ?? null;
          console.log("➡️", tsym, lp);

          // 3️⃣ option chain (INDEX ONLY — stock chains not supported)
          let options = null;

          if (quoteReply.tsym) {
            const atmStrike = Math.round(lp / 50) * 50;

            console.log("-------++++++++++++++++----->", {
              tsym: stock,
              exch: "NFO",
              strprc: String(atmStrike),
              cnt: 5,
            });

            try {
              options = await rateLimitedCall(() =>
                api.get_option_chain({
                  tsym: tsym, // ⚠️ ensure this is index symbol if required
                  exch: "NFO",
                  strprc: String(atmStrike),
                  cnt: 5,
                }),
              );
            } catch (err) {
              console.warn(
                `⚠️ Option chain failed for ${stock} (skipping):`,
                err?.message || err,
              );
              options = null; // explicit
            }
          }
          console.log("-------------------->", options);

          dataToSave[stock] = {
            tsym,
            token,
            lp,
            options,
            timestamp: new Date().toISOString(),
          };

          results.push({ stock, success: true });
        } catch (err) {
          console.error(`❌ ${stock} failed:`, err.message);
          results.push({ stock, success: false, error: err.message });
        }
      }),
    );

    console.log(`⚡ Total time: ${(Date.now() - startTime) / 1000}s`);

    // =============================
    // SAVE FILE
    // =============================
    fs.writeFileSync(filename, JSON.stringify(dataToSave, null, 2));
    fs.writeFileSync(
      "stock_tokens_latest.json",
      JSON.stringify(dataToSave, null, 2),
    );

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      success: true,
      source: "live",
      results,
    });
  } catch (error) {
    console.error("❌ Shoonya flow failed:", error);

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export default async function handler(req, res) {
  // Handle OPTIONS for CORS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  // Handle POST request
  if (req.method !== "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(405).json({
      error: "Method not allowed",
      allowed: ["POST", "GET", "OPTIONS"],
    });
  }

  try {
    // 1. Parse and validate JSON
    let payload;
    try {
      payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (parseError) {
      return res.status(400).json({
        error: "Invalid JSON payload",
        message: parseError.message,
      });
    }
    if (!!authparams && !!authparams.userid) {
      await placeOrder(payload, authparams, res);
    }
  } catch (error) {
    console.error("Webhook error:", error);
    const startTime = Date.now();
    const elapsed = Date.now() - startTime;
    const timeLeft = 10000 - elapsed;

    const statusCode = timeLeft < 100 ? 504 : 500;

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(statusCode).json({
      error: "Processing failed",
      message: error.message,
      elapsed,
      timeLeft,
      suggestion:
        timeLeft < 1000
          ? "Consider using fallback storage"
          : "Check Firebase configuration",
    });
  }
}
