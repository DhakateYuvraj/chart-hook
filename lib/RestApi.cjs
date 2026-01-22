"use strict";

const axios = require("axios");
var sha256 = require("crypto-js/sha256");

const { API } = require("./config.cjs");
const WS = require("./WebSocket.cjs");

var NorenRestApi = function (params) {
  var self = this;
  self.__susertoken = "";

  var endpoint = API.endpoint;
  var debug = API.debug;
  var routes = {
    authorize: "/QuickAuth",
    logout: "/Logout",
    forgot_password: "/ForgotPassword",
    watchlist_names: "/MWList",
    watchlist: "/MarketWatch",
    watchlist_add: "/AddMultiScripsToMW",
    watchlist_delete: "/DeleteMultiMWScrips",
    placeorder: "/PlaceOrder",
    modifyorder: "/ModifyOrder",
    cancelorder: "/CancelOrder",
    exitorder: "/ExitSNOOrder",
    orderbook: "/OrderBook",
    tradebook: "/TradeBook",
    singleorderhistory: "/SingleOrdHist",
    searchscrip: "/SearchScrip",
    TPSeries: "/TPSeries",
    optionchain: "/GetOptionChain",
    holdings: "/Holdings",
    limits: "/Limits",
    positions: "/PositionBook",
    scripinfo: "/GetSecurityInfo",
    getquotes: "/GetQuotes",
    placeGTTOrder: "/PlaceGTTOrder",
  };

  axios.interceptors.request.use((req) => {
    console.log(`${req.method} ${req.url} ${req.data}`);
    // Important: request interceptors **must** return the request.
    return req;
  });
  // Add a response interceptor
  axios.interceptors.response.use(
    (response) => {
      if (API.debug) console.log(response);
      // console.log("response::", response)
      if (response.status === 200) {
        if (response.data.success || response.data.status) {
          return response.data;
        } else {
          return response.data;
        }
      }
    },
    (error) => {
      console.log(error);
      let errorObj = {};

      if (error.response) {
        //    errorObj.status = error.response.status;
        //    errorObj.message = error.response.statusText;
      } else {
        errorObj.status = 500;
        errorObj.message = "Error";
      }

      return Promise.reject(errorObj);
    },
  );

  function post_request(route, params, usertoken = "") {
    let url = endpoint + routes[route];
    let payload = "jData=" + JSON.stringify(params);
    //if(usertoken.isEmpty == false)
    payload = payload + `&jKey=${self.__susertoken}`;
    return axios.post(url, payload);

    //return requestInstance.request(options);
  }

  self.setSessionDetails = function (response) {
    self.__susertoken = response.susertoken;
    self.__username = response.actid;
    self.__accountid = response.actid;
  };

  /**
   * Description
   * @method login
   * @param {string} userid
   * @param {string} password
   * @param {string} twoFA
   * @param {string} vendor_code
   * @param {string} api_secret
   * @param {string} imei
   */

  self.login = function (params) {
    let pwd = sha256(params.password).toString();
    let u_app_key = `${params.userid}|${params.api_secret}`;
    let app_key = sha256(u_app_key).toString();

    let authparams = {
      source: "API",
      apkversion: "js:1.0.0",
      uid: params.userid,
      pwd: pwd,
      factor2: params.twoFA,
      vc: params.vendor_code,
      appkey: app_key,
      imei: params.imei,
    };

    console.log(authparams);
    let auth_data = post_request("authorize", authparams);

    auth_data
      .then((response) => {
        if (response.stat == "Ok") {
          self.setSessionDetails(response);
        }
      })
      .catch(function (err) {
        throw err;
      });

    return auth_data;
  };

  /**
   * Description
   * @method searchscrip
   * @param {string} exchange
   * @param {string} searchtext
   */

  self.searchscrip = function (exchange, searchtext) {
    let values = {};
    values["uid"] = self.__username;
    values["exch"] = exchange;
    values["stext"] = searchtext;

    let reply = post_request("searchscrip", values, self.__susertoken);

    reply
      .then((response) => {
        if (response.stat == "Ok") {
        }
      })
      .catch(function (err) {
        throw err;
      });

    return reply;
  };

  /**
   * Description
   * @method get_quotes
   * @param {string} exchange
   * @param {string} token
   */

  self.get_quotes = function (exchange, token) {
    let values = {};
    values["uid"] = self.__username;
    values["exch"] = exchange;
    values["token"] = token;

    let reply = post_request("getquotes", values, self.__susertoken);
    return reply;
  };

  /**
   * Description
   * @method get_time_price_series
   * @param {string} exchange
   * @param {string} token
   * @param {string} starttime
   * @param {string} endtime
   * @param {string} interval
   */

  self.get_time_price_series = function (params) {
    let values = {};
    values["uid"] = self.__username;
    values["exch"] = params.exchange;
    values["token"] = params.token;
    values["st"] = params.starttime;
    if (params.endtime !== undefined) values["et"] = params.endtime;
    if (params.interval !== undefined) values["intrv"] = params.interval;

    let reply = post_request("TPSeries", values, self.__susertoken);
    return reply;
  };

  /**
 * Get latest candle data
 * @method get_latest_candle
 * @param {string} exchange - Exchange
 * @param {string} token - Contract token
 * @param {number} [minutes=5] - Minutes of data
 * @returns {Promise<Object>} Latest candle data
 */
self.get_latest_candle = function (exchange, token, minutes = 5) {
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - minutes * 60;

  const params = {
    exchange,
    token,
    starttime: String(startTime),
    endtime: String(now)
  };

  return self.get_time_price_series(params).then(response => {
    if (!Array.isArray(response) || response.length === 0) {
      // retry with bigger window
      if (minutes < 1000) {
        return self.get_latest_candle(exchange, token, 1000);
      }
      throw new Error("No candle data available");
    }

    // pick the LATEST candle
    const latestCandle = response[response.length - 1];

    if (!latestCandle) {
      throw new Error("Latest candle is undefined");
    }

    const toFloat = v => (v != null ? parseFloat(v) : 0);
    const toInt = v => (v != null ? parseInt(v) : 0);

    return {
      time: latestCandle.time,
      open: toFloat(latestCandle.into),
      high: toFloat(latestCandle.inth),
      low: toFloat(latestCandle.intl),
      close: toFloat(latestCandle.intc),
      volume: toInt(latestCandle.intv),
      wap: toFloat(latestCandle.intwap),
      oi: toInt(latestCandle.intoi ?? latestCandle.oi),
      timestamp: new Date(
        latestCandle.time.replace(
          /(\d{2})\/(\d{2})\/(\d{4})/,
          "$2/$1/$3"
        )
      )
    };
  });
};


  /**
 * Place Good Till Triggered (GTT) Order - CORRECTED VERSION
 * @method place_gtt_order
 * @param {Object} gttParams - GTT order parameters
 * @returns {Promise} Promise with GTT order response
 */
self.place_gtt_order = function (gttParams) {
    
    let values = {};
    values["uid"] = self.__username;
    values["tsym"] = gttParams.tsym;
    values["exch"] = gttParams.exch;
    values["ai_t"] = gttParams.ai_t;  // This was missing/misnamed!
    values["validity"] = gttParams.validity;
    values["d"] = gttParams.d;        // This is the trigger value
    values["remarks"] = gttParams.remarks;
    values["trantype"] = gttParams.trantype;
    values["prctyp"] = gttParams.prctyp;
    values["prd"] = gttParams.prd;
    values["ret"] = gttParams.ret;
    values["actid"] = gttParams.actid || self.__accountid;
    values["qty"] = gttParams.qty.toString();
    values["prc"] = gttParams.prc.toString();
    
    if (gttParams.dscqty !== undefined) {
        values["dscqty"] = gttParams.dscqty.toString();
    }
    
    // Debug: Log what we're sending
    console.log("Sending GTT values:", JSON.stringify(values, null, 2));
    
    let reply = post_request("placeGTTOrder", values, self.__susertoken);
    
    return reply;
};


  /**
   * Description
   * @method place_order
   * @param {string} buy_or_sell
   * @param {string} product_type
   */
  self.place_order = function (order) {
    let values = { ordersource: "API" };
    values["uid"] = self.__username;
    values["actid"] = self.__accountid;
    values["trantype"] = order.buy_or_sell;
    values["prd"] = order.product_type;
    values["exch"] = order.exchange;
    values["tsym"] = order.tradingsymbol;
    values["qty"] = order.quantity.toString();
    values["dscqty"] = order.discloseqty.toString();
    values["prctyp"] = order.price_type;
    values["prc"] = order.price.toString();
    values["remarks"] = order.remarks;

    if (order.amo !== undefined) values["ret"] = order.retention;
    else values["ret"] = "DAY";

    if (order.trigger_price !== undefined)
      values["trgprc"] = order.trigger_price.toString();

    if (order.amo !== undefined) values["amo"] = order.amo;

    //if cover order or high leverage order
    if (order.product_type == "H") {
      values["blprc"] = order.bookloss_price.toString();
      //trailing price
      if (order.trail_price != 0.0) {
        values["trailprc"] = order.trail_price.toString();
      }
    }

    //bracket order
    if (order.product_type == "B") {
      values["blprc"] = order.bookloss_price.toString();
      values["bpprc"] = order.bookprofit_price.toString();
      //trailing price
      if (order.trail_price && order.trail_price != 0.0) {
        values["trailprc"] = order.trail_price.toString();
      }
    }

    let reply = post_request("placeorder", values, self.__susertoken);
    return reply;
  };
  /**
   * Description
   * @method modify_order
   * @param {string} orderno
   * @param {string} exchange
   * @param {string} tradingsymbol
   * @param {integer} newquantity
   * @param {string} newprice_type
   * @param {integer} newprice
   * @param {integer} newtrigger_price
   * @param {integer} bookloss_price
   * @param {integer} bookprofit_price
   * @param {integer} trail_price
   */

  self.modify_order = function (modifyparams) {
    let values = { ordersource: "API" };
    values["uid"] = self.__username;
    values["actid"] = self.__accountid;
    values["norenordno"] = modifyparams.orderno;
    values["exch"] = modifyparams.exchange;
    values["tsym"] = modifyparams.tradingsymbol;
    values["qty"] = modifyparams.newquantity.toString();
    values["prctyp"] = modifyparams.newprice_type;
    values["prc"] = modifyparams.newprice.toString();

    if (
      modifyparams.newprice_type == "SL-LMT" ||
      modifyparams.newprice_type == "SL-MKT"
    ) {
      values["trgprc"] = modifyparams.newtrigger_price.toString();
    }

    //#if cover order or high leverage order
    if (modifyparams.bookloss_price !== undefined) {
      values["blprc"] = modifyparams.bookloss_price.toString();
    }
    //#trailing price
    if (modifyparams.trail_price !== undefined) {
      values["trailprc"] = modifyparams.trail_price.toString();
    }
    //#book profit of bracket order
    if (modifyparams.bookprofit_price !== undefined) {
      values["bpprc"] = modifyparams.bookprofit_price.toString();
    }

    let reply = post_request("modifyorder", values, self.__susertoken);
    return reply;
  };

  /**
   * Description
   * @method cancel_order
   * @param {string} orderno
   */

  self.cancel_order = function (orderno) {
    let values = { ordersource: "API" };
    values["uid"] = self.__username;
    values["norenordno"] = orderno;

    let reply = post_request("cancelorder", values, self.__susertoken);
    return reply;
  };
  /**
   * Description
   * @method exit_order
   * @param {string} orderno
   * @param {string} product_type
   */

  self.exit_order = function (orderno, product_type) {
    let values = {};
    values["uid"] = self.__username;
    values["norenordno"] = orderno;
    values["prd"] = product_type;

    let reply = post_request("exitorder", values, self.__susertoken);
    return reply;
  };

  /**
   * Description
   * @method get_option_chain
   * @param {object} params - Parameters for option chain
   * @param {string} params.tsym - Trading symbol of any option or future (URL encoded)
   * @param {string} params.exch - Exchange (NFO/CDS/MCX)
   * @param {number} params.strprc - Mid price for option chain selection
   * @param {number} params.cnt - Number of strikes to return on each side
   * @returns {Promise} Promise with option chain data
   */
  self.get_option_chain = function (params) {
    let values = {};
    values["uid"] = self.__username;
    values["tsym"] = params.tsym;
    values["exch"] = params.exch;
    values["strprc"] = params.strprc.toString();
    values["cnt"] = params.cnt.toString();

    let reply = post_request("optionchain", values, self.__susertoken);

    reply
      .then((response) => {
        if (response.stat == "Ok") {
          // You can add custom processing here if needed
        }
      })
      .catch(function (err) {
        throw err;
      });

    return reply;
  };

  /**
   * Description
   * @method get_orderbook
   * @param no params
   */

  self.get_orderbook = function () {
    let values = {};
    values["uid"] = self.__username;

    let reply = post_request("orderbook", values, self.__susertoken);
    return reply;
  };
  /**
   * Description
   * @method get_tradebook
   * @param no params
   */

  self.get_tradebook = function () {
    let values = {};
    values["uid"] = self.__username;
    values["actid"] = self.__accountid;

    let reply = post_request("tradebook", values, self.__susertoken);
    return reply;
  };
  /**
   * Description
   * @method get_holdings
   * @param product_type
   */

  self.get_holdings = function (product_type = "C") {
    let values = {};
    values["uid"] = self.__username;
    values["actid"] = self.__accountid;
    values["prd"] = product_type;

    let reply = post_request("holdings", values, self.__susertoken);
    return reply;
  };
  /**
   * Description
   * @method get_positions
   * @param no params
   */

  self.get_positions = function () {
    let values = {};
    values["uid"] = self.__username;
    values["actid"] = self.__accountid;

    let reply = post_request("positions", values, self.__susertoken);
    return reply;
  };
  /**
   * Description
   * @method get_limits
   * @param optional params
   */

  self.get_limits = function (product_type = "", segment = "", exchange = "") {
    let values = {};
    values["uid"] = self.__username;
    values["actid"] = self.__accountid;

    if (product_type != "") {
      values["prd"] = product_type;
    }

    if (product_type != "") {
      values["seg"] = segment;
    }

    if (exchange != "") {
      values["exch"] = exchange;
    }

    let reply = post_request("limits", values, self.__susertoken);
    return reply;
  };
  /**
   * Description
   * @method start_websocket
   * @param no params
   */
  self.start_websocket = function (callbacks) {
    let web_socket = new WS({ url: API.websocket, apikey: self.__susertoken });

    self.web_socket = web_socket;
    let params = {
      uid: self.__username,
      actid: self.__username,
      apikey: self.__susertoken,
    };

    web_socket.connect(params, callbacks).then(() => {
      console.log("ws is connected");
    });
  };

  self.subscribe = function (instrument, feedtype) {
    let values = {};
    values["t"] = "t";
    values["k"] = instrument;
    self.web_socket.send(JSON.stringify(values));
  };

  /**
   * Get Security Information for a contract
   * @method get_security_info
   * @param {Object} params - Security info parameters
   * @param {string} params.exch - Exchange (NSE, BSE, NFO, etc.)
   * @param {string} params.token - Contract token
   * @returns {Promise} Promise with security information
   */

  self.get_security_info = function (params) {
    let values = {};
    values["uid"] = self.__username;

    if (params.exch !== undefined) {
      values["exch"] = params.exch;
    }

    if (params.token !== undefined) {
      values["token"] = params.token;
    }

    // Validate that at least one of exch or token is provided
    if (!values.exch && !values.token) {
      return Promise.reject(
        new Error("Either exchange or token must be provided"),
      );
    }

    let reply = post_request("scripinfo", values, self.__susertoken);

    reply
      .then((response) => {
        if (response.stat == "Ok") {
          // Optional: You can add custom processing here
          // For example, parse expiry date if present
          if (response.exd) {
            response.expiryDate = parseDate(response.exd);
          }
        }
      })
      .catch(function (err) {
        throw err;
      });

    return reply;
  };

  // Complete class method to get future expiries
  self.get_future_expiries = function (underlying, exchange = "NFO") {
    let values = {};
    const monthName = getMonthName();
    values["uid"] = self.__username;
    values["exch"] = exchange;
    values["stext"] = `${underlying} ${monthName} FUT`;

    let reply = post_request("searchscrip", values, self.__susertoken);

    return reply
      .then((response) => {
        if (response.stat === "Ok" && response.values) {
          const expiries = [];
          const seen = new Set();
          //expiries.push(response.values[0]);

          // Sort by expiry date
          return response?.values?.sort((a, b) => a.exd - b.exd)?.[0];
        }
        return [];
      })
      .catch((error) => {
        console.error("Error in get_future_expiries:", error);
        throw error;
      });
  };

  function getMonthName(monthIndex) {
    const months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    return months[monthIndex] || "";
  }
};

module.exports = NorenRestApi;
