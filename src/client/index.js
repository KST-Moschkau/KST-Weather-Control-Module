/*
 * Copyright (c) 2022 KST Moschkau GmbH.
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
  pollingInterval = 5;
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
        this.api.off("statuschange", this.onStatusChange.bind(this));
        this.api.off("linkchange", this.onLinkChange.bind(this));
      }
    };

    //register the HUBModule
    await window.registerRealityHubModule({
      name: "kst.wc_client",
      label: "Weather Control",
      init: (registrationResult) => initModule(registrationResult),
      destroy: () => destroyModule(),
    });

    // Download Module Example's HTML file and set it to our container element
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
      console.log(autoButton.value);
      if (autoButton.value === "false") {
        this.api.startPolling();
        console.log("Trying to start Polling with " + this.pollingInterval);
        console.log("Auto Update activated.");
      } else {
        this.api.stopPolling();
        console.log("Auto Update deactivated");
      }
      this.api.storeIni();
    });

    // Bind "Update" button's click handler
    const updateButton = this.containerElement.querySelector("#btnUpdate");

    updateButton.addEventListener("click", () => {
      console.log("Triggering manual update..");
      this.api.startPolling();
      this.api.stopPolling();
    });

    // Subscribe to (polling) status change event
    this.api.on("statuschange", this.onStatusChange.bind(this));

    // Subscribe to (linked) status change event
    this.api.on("linkchange", this.onLinkChange.bind(this));

    // Subscribe to weatherdata event
    this.api.on("weatherdata", this.weatherData.updateData.bind(this));
    this.api.on("weatherdata", this.weatherData.drawData.bind(this));
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

  onLinkChange(e) {
    this.isLinked = e.isLinked === true;
    const linkButton = this.containerElement.querySelector("#btnLnk");
    if (this.isLinked) {
      linkButton.classList.add("buttonToggled");
    } else linkButton.classList.remove("buttonToggled");
    console.log("Changing link state to: " + this.isLinked);
    linkButton.value = this.isLinked;
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
    this.sunriseTime = new Date();
    this.sunriseString = "08:00";
    this.sunsetString = "21:00";
    this.sunsetTime = new Date();
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
    this.sunriseTime = weatherdata.sys.sunrise;
    this.sunriseDate = new Date(
      (this.sunriseTime + weatherdata.timezone - 3600) * 1000
    );
    this.sunriseString =
      this.sunriseDate.getHours() + ":" + this.sunriseDate.getMinutes();
    this.sunsetTime = weatherdata.sys.sunset;
    this.sunsetDate = new Date(
      (this.sunsetTime + weatherdata.timezone - 3600) * 1000
    );
    this.sunsetString =
      this.sunsetDate.getHours() + ":" + this.sunsetDate.getMinutes();
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
