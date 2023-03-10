/*
 * Copyright (c) 2023 KST Moschkau GmbH.
 *
 * This file is part of Kst Weather Control.
 * This is a personal project of the all-knowing Felix
 * use it or get used by it!
 *
 * Kst Weather Control is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3, as published by
 * the Free Software Foundation.
 *
 * Kst Weather Control is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Kst Weather Control. If not, see <https://www.gnu.org/licenses/>.
 */

class KSTWCClient {
  weatherData = null;
  favs = null;
  pollingInterval = 5;
  receivingCounter = 0;
  isLinked = false;
  isAutoUpdating = false;
  container = null;

  async start() {
    console.info("Starting client..");
    this.containerElement = document.createElement("div");

    const initModule = (params) => {
      const { brokerClient } = params;

      this.api = brokerClient.api.kst.wc;
      this.realityWorldAPI = brokerClient.api.hub.reality_world;
      this.weatherData = new WeatherData(this.realityWorldAPI);

      this.container = this.containerElement;
      return this.containerElement;
    };

    const destroyModule = () => {
      if (this.containerElement) {
        this.containerElement.remove();
      }

      if (this.api) {
        //Unsubscribe subscribed events..
        this.api.off("weatherdata", this.weatherData.updateData.bind(this));
        this.api.off("weatherdata", this.weatherData.drawData.bind(this));
        this.api.off("weatherdata", this.onCityIDChange.bind(this));
        this.api.off("statuschange", this.onStatusChange.bind(this));
        this.api.off("fav", this.onFavChange.bind(this));
        this.api.off("statusMessage", this.onStatusMessage.bind(this));
        this.api.off("linkchange", this.onLinkChange.bind(this));
        this.api.off("overrchange", this.onOverrideChange.bind(this));
        this.api.off("currentOverrchange", this.onCurrentOverrChange.bind(this));
      }
    };

    //register the HUBModule
    await window.registerRealityHubModule({
      name: "kst.wc_client",
      label: "Weather Control",
      init: (registrationResult) => initModule(registrationResult),
      destroy: () => destroyModule(),
    });

    // Download Module's HTML file and set it to our container element
    const response = await fetch("/modules/kst.wc/index.html");
    this.containerElement.innerHTML = await response.text();
    this.weatherData.drawFirstData(this.containerElement);

    // Get the pollingInterval from Server
    const pollingIntervalResponse = await this.api.getPollingInterval();
    this.pollingInterval = pollingIntervalResponse.pollInterval;
    const intervalField =
      this.containerElement.querySelector("#pollingInterval");
    intervalField.property = {
      ...this,
      Value: this.pollingInterval,
    };

    //get the CityID from Server
    const cityIDField = this.containerElement.querySelector("#cityID");
    const cityID = await this.api.getCityID();
    cityIDField.property = {
      ...this,
      Value: cityID,
    };

    //get the APIToken from Server
    const tokenField = this.containerElement.querySelector("#token");
    const token = await this.api.getToken();
    tokenField.property = {
      ...this,
      Value: token,
    };

    // Check for changes in the interval Field and apply them
    intervalField.addEventListener("change", () => {
      console.log("Changing pollingInterval to " + this.pollingInterval);
      this.pollingInterval = intervalField.property.Value;
      this.api.changePollingInterval(this.pollingInterval);
    });

    // Bind "Find City" button's click handler
    const findButton = this.containerElement.querySelector("#btnSync");

    findButton.addEventListener("click", () => {
      this.api.changeCityID(cityIDField.property.Value);
      this.api.changeToken(tokenField.property.Value);
      console.log(
        "Sending new CityID " +
        cityIDField.property.Value +
        " and new APIToken " +
        tokenField.property.Value
      );
    });

    // Bind "Override" button's click handler and get initial state
    const overrButton = this.containerElement.querySelector("#btnWeatherOr");

    const overrResponse = await this.api.isOverridden();
    this.isOverridden = overrResponse;
    if (this.isOverridden) {
      overrButton.classList.add("buttonToggled");
    } else overrButton.classList.remove("buttonToggled");
    overrButton.value = this.isOverridden;

    overrButton.addEventListener("click", () => {
      var state = overrButton.value === "true";
      this.api.changeOverridden(!state);
    });

    // Bind Override Dropdown and get initial state
    const overrSelect = this.containerElement.querySelector("#WeatherOR");
    const overrides = await this.api.getOverrides();
    const names = overrides.flat();
    for (var i = 1; i <= 7; i++) {
      overrSelect[i - 1].label = names[i];
    }
    const overrIDResponse = await this.api.getCurrentOverr();
    overrSelect.value = overrIDResponse;

    overrSelect.addEventListener("change", () => {
      console.log("Changing Drop down to: " + overrSelect.value);
      this.api.changeCurrentOverr(overrSelect.value);
    })


    // Bind "Link" button's click handler and get initial state
    const linkButton = this.containerElement.querySelector("#btnLnk");

    const linkedResponse = await this.api.isLinked();
    this.isLinked = linkedResponse;
    if (this.isLinked) {
      linkButton.classList.add("buttonToggled");
    } else linkButton.classList.remove("buttonToggled");
    linkButton.value = this.isLinked;

    linkButton.addEventListener("click", () => {
      var state = linkButton.value === "true";
      this.api.changeLinked(!state);
    });

    // Get the current polling status

    // Bind "AutoUpdate" button's click handler and get initial state
    const autoButton = this.containerElement.querySelector("#btnAutoUpdate");

    const statusResponse = await this.api.getStatus();
    this.isAutoUpdating = statusResponse.status === "started";
    if (this.isAutoUpdating) {
      autoButton.classList.add("buttonToggled");
    } else autoButton.classList.remove("buttonToggled");
    autoButton.value = this.isAutoUpdating;

    autoButton.addEventListener("click", () => {
      this.api.changeAutoPolling(autoButton.value === "false");
    });

    // Bind "Update" button's click handler
    const updateButton = this.containerElement.querySelector("#btnUpdate");

    updateButton.addEventListener("click", () => {
      console.log("Triggering manual update..");
      this.api.startPolling();
      this.api.stopPolling();
    });

    //Bind Fav buttons
    const fav01Button = this.containerElement.querySelector("#btnFav01");
    const fav02Button = this.containerElement.querySelector("#btnFav02");
    const fav03Button = this.containerElement.querySelector("#btnFav03");
    const fav04Button = this.containerElement.querySelector("#btnFav04");

    var longpress = false;
    var presstimer = null;

    fav01Button.addEventListener("mousedown", (e) => {
      if (e.type === "click" && e.button !== 0) {
        return;
      }

      longpress = false;

      fav01Button.classList.add("buttonLongpress");

      const longpressFunc = (api) => {
        console.log("Telling server to store new Fav01 with cityID " + this.cityID);
        api.changeFav(1);
        longpress = true;
      }

      presstimer = setTimeout(longpressFunc.bind(null, this.api), 1000);

      return false;
    });

    fav01Button.addEventListener("click", (e) => {
      if (presstimer !== null) {
        clearTimeout(presstimer);
        presstimer = null;
      }

      fav01Button.classList.remove("buttonLongpress");

      if (longpress) {
        return false;
      }
      console.log("Asking server to load Fav01");
      this.api.changeCityID(this.favs[1][1]);
    });

    fav01Button.addEventListener("mouseout", (e) => {
      if (presstimer !== null) {
        clearTimeout(presstimer);
        presstimer = null;
      }

      fav01Button.classList.remove("buttonLongpress");
    });

    fav02Button.addEventListener("mousedown", (e) => {
      if (e.type === "click" && e.button !== 0) {
        return;
      }

      longpress = false;

      fav02Button.classList.add("buttonLongpress");

      const longpressFunc = (api) => {
        console.log("Telling server to store new Fav02 with cityID " + this.cityID);
        api.changeFav(2);
        longpress = true;
      }

      presstimer = setTimeout(longpressFunc.bind(null, this.api), 1000);

      return false;
    });

    fav02Button.addEventListener("click", (e) => {
      if (presstimer !== null) {
        clearTimeout(presstimer);
        presstimer = null;
      }

      fav02Button.classList.remove("buttonLongpress");

      if (longpress) {
        return false;
      }
      console.log("Asking server to load Fav02");
      this.api.changeCityID(this.favs[1][2]);
    });

    fav02Button.addEventListener("mouseout", (e) => {
      if (presstimer !== null) {
        clearTimeout(presstimer);
        presstimer = null;
      }

      fav02Button.classList.remove("buttonLongpress");
    });

    fav03Button.addEventListener("mousedown", (e) => {
      if (e.type === "click" && e.button !== 0) {
        return;
      }

      longpress = false;

      fav03Button.classList.add("buttonLongpress");

      const longpressFunc = (api) => {
        console.log("Telling server to store new Fav03 with cityID " + this.cityID);
        api.changeFav(3);
        longpress = true;
      }

      presstimer = setTimeout(longpressFunc.bind(null, this.api), 1000);

      return false;
    });

    fav03Button.addEventListener("click", (e) => {
      if (presstimer !== null) {
        clearTimeout(presstimer);
        presstimer = null;
      }

      fav03Button.classList.remove("buttonLongpress");

      if (longpress) {
        return false;
      }
      console.log("Asking server to load Fav03");
      this.api.changeCityID(this.favs[1][3]);
    });

    fav03Button.addEventListener("mouseout", (e) => {
      if (presstimer !== null) {
        clearTimeout(presstimer);
        presstimer = null;
      }

      fav03Button.classList.remove("buttonLongpress");
    });

    fav04Button.addEventListener("mousedown", (e) => {
      if (e.type === "click" && e.button !== 0) {
        return;
      }

      longpress = false;

      fav04Button.classList.add("buttonLongpress");

      const longpressFunc = (api) => {
        console.log("Telling server to store new Fav04 with cityID " + this.cityID);
        api.changeFav(4);
        longpress = true;
      }

      presstimer = setTimeout(longpressFunc.bind(null, this.api), 1000);

      return false;
    });

    fav04Button.addEventListener("click", (e) => {
      if (presstimer !== null) {
        clearTimeout(presstimer);
        presstimer = null;
      }

      fav04Button.classList.remove("buttonLongpress");

      if (longpress) {
        return false;
      }
      console.log("Asking server to load Fav04");
      this.api.changeCityID(this.favs[1][4]);
    });

    fav04Button.addEventListener("mouseout", (e) => {
      if (presstimer !== null) {
        clearTimeout(presstimer);
        presstimer = null;
      }

      fav04Button.classList.remove("buttonLongpress");
    });

    // Subscribe to (polling) status change event
    this.api.on("statuschange", this.onStatusChange.bind(this));

    // Subscribe to favChange event
    this.api.on("favs", this.onFavChange.bind(this));

    // Subscribe to status message change event
    this.api.on("statusMessage", this.onStatusMessage.bind(this));
    const statusField = this.containerElement.querySelector("#status");
    statusField.property = {
      ...this,
      Value: "Initializing..",
    };

    // Subscribe to (linked) status change event
    this.api.on("linkchange", this.onLinkChange.bind(this));

    // Subscribe to (overridden) status change event
    this.api.on("overrchange", this.onOverrideChange.bind(this));

    // Subscribe to (override ID) status change event
    this.api.on("currentOverrchange", this.onCurrentOverrChange.bind(this));

    // Subscribe to weatherdata event
    this.api.on("weatherdata", this.weatherData.updateData.bind(this));
    this.api.on("weatherdata", this.weatherData.drawData.bind(this));
    this.api.on("weatherdata", this.onCityIDChange.bind(this));

    //get current weatherdata from server
    this.api.emitCurrentWeatherData();
    this.api.emitFavs();
    setTimeout(() => {
      statusField.property = {
        ...this,
        Value: "Server sent data.",
      };
    }, 2000);
  }

  onStatusChange(e) {
    const started = e.status === "started";
    const autoButton = this.containerElement.querySelector("#btnAutoUpdate");
    if (started) {
      autoButton.classList.add("buttonToggled");
    } else autoButton.classList.remove("buttonToggled");
    console.log("Changing Status to: " + started);
    autoButton.value = started;
    this.isAutoUpdating = started;
  }

  onStatusMessage(e) {
    var message = e.message;
    if (message == "Weather Data received.") {
      this.receivingCounter++;
      message = message + " " + this.receivingCounter;
    } else this.receivingCounter = 0;
    const statusField = this.containerElement.querySelector("#status");
    statusField.property = {
      ...this,
      Value: message,
    };
  }

  onLinkChange(e) {
    this.isLinked = e.isLinked === true;
    const linkButton = this.containerElement.querySelector("#btnLnk");
    if (this.isLinked) {
      linkButton.classList.add("buttonToggled");
    } else linkButton.classList.remove("buttonToggled");
    console.log("Changing link state to: " + this.isLinked);
    linkButton.value = this.isLinked;
  }

  onOverrideChange(e) {
    this.isOverridden = e.isOverridden === true;
    const overrButton = this.containerElement.querySelector("#btnWeatherOr");
    if (this.isOverridden) {
      overrButton.classList.add("buttonToggled");
    } else overrButton.classList.remove("buttonToggled");
    console.log("Changing override state to: " + this.isOverridden);
    overrButton.value = this.isOverridden;
  }

  onCurrentOverrChange(e) {
    console.log("Changing override ID to: " + e.currentOverr);
    const overrSelect = this.containerElement.querySelector("#WeatherOR");
    overrSelect.value = e.currentOverr;
  }

  onFavChange(e) {
    console.log("New Favs received form server.");
    this.favs = e;
    const fav01Button = this.containerElement.querySelector("#btnFav01");
    const fav02Button = this.containerElement.querySelector("#btnFav02");
    const fav03Button = this.containerElement.querySelector("#btnFav03");
    const fav04Button = this.containerElement.querySelector("#btnFav04");
    fav01Button.innerText = fav01Button.textContent = e[0][1];
    fav02Button.innerText = fav02Button.textContent = e[0][2];
    fav03Button.innerText = fav03Button.textContent = e[0][3];
    fav04Button.innerText = fav04Button.textContent = e[0][4];
  }

  onCityIDChange(e) {
    if (e.id != this.cityID) {
      console.log("Noticed serverside ID change. Changing to " + e.id);
      this.cityID = e.id;
    }
    const cityIDField = this.containerElement.querySelector("#cityID");
    const cityID = e.id;
    cityIDField.property = {
      ...this,
      Value: cityID,
    };
  }
}

//new class for handling the weatherdata
class WeatherData {
  constructor(realityWorldAPI) {
    this.realityWorldAPI = realityWorldAPI;
    this.city = "KST";
    this.cityID = "1337";
    this.time = "TestTime";
    this.date = new Date();
    this.dateISOTime = null;
    this.sunriseString = "08:00:00";
    this.sunsetString = "21:00:00";
    this.temperature = 36;
    this.temperatureString = "36 °C";
    this.humidity = 100;
    this.humidityString = "100 %";
    this.pressure = 1000;
    this.pressureString = "1000 hPa";
    this.windSpeed = 100;
    this.windSpeedString = "100 m/s";
    this.windDirection = 0;
    this.windDirectionString = "0 °";
    this.cloudCoverage = 100;
    this.cloudCoverageString = "100 %";
    this.weather = "Meteroid Shower";
    this.weatherID = 762;
    this.iconID = "11n";
    this.lastUpdateString = "Never";
    this.lastUpdateDate = new Date();
    this.conEle = null;
  }

  //first draw with default data
  drawFirstData(containerElement) {
    console.log("Drawing default data...");
    this.conEle = containerElement;
    const cityField = this.conEle.querySelector("#cityName");
    const cityIDField = this.conEle.querySelector("#cityIDRead");
    const timeField = this.conEle.querySelector("#time");
    const sunSetField = this.conEle.querySelector("#sunSet");
    const sunRiseField = this.conEle.querySelector("#sunRise");
    const tempField = this.conEle.querySelector("#temp");
    const humField = this.conEle.querySelector("#hum");
    const pressField = this.conEle.querySelector("#press");
    const wSpdField = this.conEle.querySelector("#wSpd");
    const wDirField = this.conEle.querySelector("#wDir");
    const wthField = this.conEle.querySelector("#wth");
    const cldField = this.conEle.querySelector("#cld");
    const lstUpdtField = this.conEle.querySelector("#lstUpdt");
    const iconField = this.conEle.querySelector("#weatherIcon");

    cityField.property = {
      ...this,
      Value: this.city,
    };
    cityIDField.property = {
      ...this,
      Value: this.cityID,
    };
    timeField.property = {
      ...this,
      Value: this.time,
    };
    sunRiseField.property = {
      ...this,
      Value: this.sunriseString,
    };
    sunSetField.property = {
      ...this,
      Value: this.sunsetString,
    };
    tempField.property = {
      ...this,
      Value: this.temperatureString,
    };
    humField.property = {
      ...this,
      Value: this.humidityString,
    };
    pressField.property = {
      ...this,
      Value: this.pressureString,
    };
    wSpdField.property = {
      ...this,
      Value: this.windSpeedString,
    };
    wDirField.property = {
      ...this,
      Value: this.windDirectionString,
    };
    wthField.property = {
      ...this,
      Value: this.weather,
    };
    cldField.property = {
      ...this,
      Value: this.cloudCoverageString,
    };
    lstUpdtField.property = {
      ...this,
      Value: this.lastUpdateString,
    };
    iconField.src =
      "http://openweathermap.org/img/wn/" + this.iconID + "@2x.png";
  }

  //drawing the actual data
  drawData() {
    console.log("Drawing data...");
    const cityField = this.containerElement.querySelector("#cityName");
    const cityIDField = this.containerElement.querySelector("#cityIDRead");
    const timeField = this.containerElement.querySelector("#time");
    const sunSetField = this.containerElement.querySelector("#sunSet");
    const sunRiseField = this.containerElement.querySelector("#sunRise");
    const tempField = this.containerElement.querySelector("#temp");
    const humField = this.containerElement.querySelector("#hum");
    const pressField = this.containerElement.querySelector("#press");
    const wSpdField = this.containerElement.querySelector("#wSpd");
    const wDirField = this.containerElement.querySelector("#wDir");
    const wthField = this.containerElement.querySelector("#wth");
    const cldField = this.containerElement.querySelector("#cld");
    const lstUpdtField = this.containerElement.querySelector("#lstUpdt");
    const iconField = this.containerElement.querySelector("#weatherIcon");


    cityField.property = {
      ...this,
      Value: this.city,
    };
    cityIDField.property = {
      ...this,
      Value: this.cityID,
    };
    timeField.property = {
      ...this,
      Value: this.time,
    };
    sunRiseField.property = {
      ...this,
      Value: this.sunriseString,
    };
    sunSetField.property = {
      ...this,
      Value: this.sunsetString,
    };
    tempField.property = {
      ...this,
      Value: this.temperatureString,
    };
    humField.property = {
      ...this,
      Value: this.humidityString,
    };
    pressField.property = {
      ...this,
      Value: this.pressureString,
    };
    wSpdField.property = {
      ...this,
      Value: this.windSpeedString,
    };
    wDirField.property = {
      ...this,
      Value: this.windDirectionString,
    };
    wthField.property = {
      ...this,
      Value: this.weather,
    };
    cldField.property = {
      ...this,
      Value: this.cloudCoverageString,
    };
    lstUpdtField.property = {
      ...this,
      Value: this.lastUpdateString,
    };
    iconField.src =
      "http://openweathermap.org/img/wn/" + this.iconID + "@2x.png";
  }

  //update the stored data which is to be drawn
  updateData(weatherdata) {
    const nodeName = "KSTWC";
    this.city = weatherdata.name;
    this.cityID = weatherdata.id;
    this.date = new Date();
    var utc = this.date.getTime() + this.date.getTimezoneOffset() * 60000;
    this.date = new Date(utc + 3600000 * (weatherdata.timezone / 3600));
    this.time =
      this.date.getDate() +
      "." +
      (this.date.getMonth() + 1) +
      "." +
      this.date.getFullYear() +
      " " +
      this.date.getHours() +
      ":" +
      this.date.getMinutes() +
      ":" +
      this.date.getSeconds() +
      " (UTC " +
      weatherdata.timezone / 3600 +
      ")";

    this.dateISOTime = new Date(
      Date.now() + (weatherdata.timezone / 60) * 60000
    ).toISOString();
    this.sunriseDate = new Date((weatherdata.sys.sunrise + weatherdata.timezone) * 1000
    );
    this.sunriseString =
      this.sunriseDate.toISOString().split("T")[1].split(".")[0];
    this.sunsetDate = new Date(
      (weatherdata.sys.sunset + weatherdata.timezone) * 1000
    );
    this.sunsetString =
      this.sunsetDate.toISOString().split("T")[1].split(".")[0];
    this.temperature = weatherdata.main.temp;
    this.temperatureString = `${weatherdata.main.temp} °C`;
    this.humidity = weatherdata.main.humidity;
    this.humidityString = `${weatherdata.main.humidity} %`;
    this.pressure = weatherdata.main.pressure;
    this.pressureString = `${weatherdata.main.pressure} hPa`;
    this.windSpeed = weatherdata.wind.speed;
    this.windSpeedString = `${weatherdata.wind.speed} m/s`;
    this.windDirection = weatherdata.wind.deg;
    this.windDirectionString = `${weatherdata.wind.deg} °`;
    this.weather = weatherdata.weather[0].main;
    this.weatherID = weatherdata.weather[0].id;
    this.cloudCoverage = weatherdata.clouds.all;
    this.cloudCoverageString = `${weatherdata.clouds.all} %`;
    this.lastUpdateDate = new Date(weatherdata.dt * 1000);
    var utc2 =
      this.lastUpdateDate.getTime() +
      this.lastUpdateDate.getTimezoneOffset() * 60000;
    this.lastUpdateDate = new Date(
      utc2 + 3600000 * (weatherdata.timezone / 3600)
    );
    this.lastUpdateString =
      this.lastUpdateDate.getDate() +
      "." +
      (this.lastUpdateDate.getMonth() + 1) +
      "." +
      this.lastUpdateDate.getFullYear() +
      " " +
      this.lastUpdateDate.getHours() +
      ":" +
      this.lastUpdateDate.getMinutes() +
      ":" +
      this.lastUpdateDate.getSeconds() +
      " (UTC " +
      weatherdata.timezone / 3600 +
      ")";
    this.iconID = weatherdata.weather[0].icon;
  }
}

const kstWCClient = new KSTWCClient();
kstWCClient.start();
