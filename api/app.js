const Api = require("../shoonyaLib/RestApi");
const speakeasy = require("speakeasy");

let { authparams } = require("./cred");

const SIGNAL_TYPE = "CE";
// Generate current TOTP token
const twoFA = speakeasy.totp({
  secret: authparams.totp_key,
  encoding: "base32",
  time: Date.now() / 1000, // Current time in seconds
});

api = new Api({});

api.login({ ...authparams, twoFA })
  .then((res) => {
    api.get_future_expiries("INFY", "NFO").then((expiries) => {
      let params1 = {
        exch: "NFO",
        token: expiries.token,
      };
      api.get_quotes("NFO", expiries.token).then((reply) => {
        let optionParams = {
          tsym: reply.tsym, // Trading symbol (URL encode if needed: encodeURIComponent("M&M"))
          exch: "NFO", // Exchange (NFO for NSE F&O)
          strprc: reply.lp, // Mid price for strike selection
          cnt: 1, // 5 strikes on each side (total 20 contracts: 5CE + 5PE on each side)
        };
        api.get_option_chain(optionParams).then((reply) => {
          const selectedOption =
            reply?.values?.filter((item) => item.optt === SIGNAL_TYPE)?.[0] ||
            {};
          const {
            exch = "NFO",
            tsym = "",
            token = "",
            ls = 0,
          } = selectedOption || {};

          api
            .get_latest_candle("NFO", token, 5)
            .then((latestCandle) => {
              let orderparams = {
                buy_or_sell: "B", //Buy
                product_type: "B", //BRACKET ORDER
                exchange: exch,
                tradingsymbol: tsym,
                quantity: ls,
                discloseqty: 0,
                price_type: "LMT",
                price: latestCandle?.close,
                bookprofit_price: latestCandle?.close * 1.1,
                bookloss_price: latestCandle?.close * 0.9,
              };
              api.place_order(orderparams).then((reply) => {
                console.log(reply);
              });
            })
            .catch((error) => {
              console.error("Error:", error.message);
            });
        });
      });
    });
    return;
  })
  .catch((err) => {
    console.error(err);
  });
