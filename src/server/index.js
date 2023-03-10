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

const { BrokerClient } = require("@zerodensity/realityhub-api");
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");

//Enter the HUB Port here
const REALITY_HUB_PORT = process.env.REALITY_HUB_PORT || 8080;
//Enter the server IP here
const SERVER_IP = "172.16.1.130";
//Enter the backend Port here
const BACKEND_Port = 5000;

class KSTWCBackend {
  constructor() {
    this.nodeName = "KSTWC";
    this.pollingInterval = 10;
    this.cityID = null;
    this.city = null;
    this.favs = null;
    this.overrides = null;
    this.pollTimer = null;
    this.apiToken = null;
    this.currentOverr = null;
    this.currentWeatherID = null;
    this.currentCloudiness = null;
    this.linked = false;
    this.overridden = false;
    this.isValidWeatherResp = false;
    this.currentWeatherData = null;
    this.iniChanged = false;
    this.iniData = require("./ini.json");
  }

  async initBroker() {
    this.brokerClient = await BrokerClient.initModule({
      menuTitle: "Weather Control",
      clientModuleName: "kst.wc_client",
      moduleName: "kst.wc",
      serverURL: "http://" + SERVER_IP + ":" + BACKEND_Port + "/",
      hub: {
        host: SERVER_IP,
        port: REALITY_HUB_PORT,
      },
    });

    this.api = this.brokerClient.api.kst.wc;
    this.realityWorldAPI = this.brokerClient.api.hub.reality_world;

    //register functions exposed to client
    await this.brokerClient.registerAPIHandlers(
      {
        startPolling: this.startPolling,
        stopPolling: this.stopPolling,
        getStatus: this.getStatus,
        getPollingInterval: this.getPollingInterval,
        getCityID: this.getCityID,
        getCurrentOverr: this.getCurrentOverr,
        getOverrides: this.getOverrides,
        getToken: this.getToken,
        emitCurrentWeatherData: this.emitCurrentWeatherData,
        emitFavs: this.emitFavs,
        isLinked: this.isLinked,
        isOverridden: this.isOverridden,
        changePollingInterval: this.changePollingInterval,
        changeCityID: this.changeCityID,
        changeFav: this.changeFav,
        changeToken: this.changeToken,
        changeAutoPolling: this.changeAutoPolling,
        changeLinked: this.changeLinked,
        changeOverridden: this.changeOverridden,
        changeCurrentOverr: this.changeCurrentOverr,
        storeIni: this.storeIni,
      },
      this
    );

    this.brokerClient.once("disconnect", () => {
      this.brokerClient.destroy();
      this.stopPolling();
      this.restart();
    });
  }

  startHTTPServer() {
    const app = express();

    app.use(express.static(path.join(__dirname, "../client")));

    app.listen(BACKEND_Port, "0.0.0.0", () => {
      console.info("Weather Control backend started on port " + BACKEND_Port);
    });
  }

  //initialise
  init() {
    this.startHTTPServer();
    this.loadIni();
    this.restart();
  }

  async restart() {
    try {
      await this.initBroker();
    } catch (e) {
      console.error("Unable to initialize Broker, exiting..");
      process.exit(1);
    }
    if (this.iniData.AutoUpdating) this.startPolling(this.pollingInterval);
  }

  //load settings
  loadIni() {
    this.cityID = this.iniData.CityID;
    this.city = this.iniData.City;
    this.favs = this.iniData.Favs;
    this.apiToken = this.iniData.APIToken;
    this.currentOverr = this.iniData.CurrentOverr;
    this.overrides = this.iniData.WeatherOverrides;
    this.pollingInterval = this.iniData.UpdateInterval;
    console.log(
      `API initialized with current CityID ${this.cityID} ,APIToken ${this.apiToken}, pollingInterval ${this.pollingInterval} and AutoUpdating = ${this.iniData.AutoUpdating}`
    );
  }

  //save settings
  storeIni() {
    if (this.iniChanged) {
      if (this.isValidWeatherResp) {
        this.iniData.CityID = this.cityID;
        this.iniData.City = this.city;
        this.iniData.Favs = this.favs;
        this.iniData.APIToken = this.apiToken;
        this.iniData.CurrentOverr = this.currentOverr;
        this.iniData.UpdateInterval = this.pollingInterval;
        this.iniData.AutoUpdating = this.getStatus().status == "started";
        const iniJSON = JSON.stringify(this.iniData);
        const fs = require("fs");
        fs.writeFile("./src/server/ini.json", iniJSON, "utf8", function (err) {
          if (err) {
            console.log("Cant write ini file!");
            return console.log(err);
          }
        });
        console.log("New ini saved.");
        this.iniChanged = false;
      } else console.log("Wont save new ini due to invalid Response!");
    } else console.log("No changes in ini no need for saving.");
  }

  //start the polling and change state
  startPolling() {
    if (this.pollTimer) return;
    this.poll();
    this.api.emit("statuschange", { status: "started" });
    this -
      this.api.emit("pollingInterval", { pollInterval: this.pollingInterval });
  }

  //Getter and Setter
  changePollingInterval(newInterval) {
    if (newInterval == this.pollingInterval) {
      console.log("Tried changing PollingInterval to " + newInterval + " but its already the active one!");
    } else {
      console.log("Changing PollingInterval to " + newInterval);
      this.pollingInterval = newInterval;
      this.iniChanged = true;
    }
  }

  changeCityID(newID) {
    if (newID == this.cityID) {
      console.log("Tried changing city ID to " + newID + " but its already the active one!");
    } else {
      console.log("Changing city ID to " + newID);
      this.cityID = newID;
      this.iniChanged = true;
    }
    if (this.getStatus().status == "stopped") {
      this.startPolling(this.pollingInterval);
      this.stopPolling();
    } else {
      this.stopPolling();
      this.startPolling(this.pollingInterval);
    }
  }

  changeFav(favIndex) {
    if (this.isValidWeatherResp) {
      if (favIndex == 1) {
        if (this.favs[1][1] == this.cityID) {
          console.log("Tried to store fav but it already is stored!");
        } else {
          this.favs[0][1] = this.city;
          this.favs[1][1] = this.cityID;
          this.iniChanged = true;
          console.log(this.city + " " + this.favs[0][1]);
        }
      } else if (favIndex == 2) {
        if (this.favs[1][2] == this.cityID) {
          console.log("Tried to store fav but it already is stored!");
        } else {
          this.favs[0][2] = this.city;
          this.favs[1][2] = this.cityID;
          this.iniChanged = true;
        }
      } else if (favIndex == 3) {
        if (this.favs[1][3] == this.cityID) {
          console.log("Tried to store fav but it already is stored!");
        } else {
          this.favs[0][3] = this.city;
          this.favs[1][3] = this.cityID;
          this.iniChanged = true;
        }
      } else {
        if (this.favs[1][4] == this.cityID) {
          console.log("Tried to store fav but it already is stored!");
        } else {
          this.favs[0][4] = this.city;
          this.favs[1][4] = this.cityID;
          this.iniChanged = true;
        }
      }
      console.log(`Saved a new fav ${favIndex} with name ${this.city} and ID ${this.cityID}`);
      this.emitFavs();
      this.storeIni();
    } else {
      console.log("Couldnt save new fav as the response is invalid.");
    }
  }

  changeToken(newToken) {
    if (newToken == this.apiToken) {
      console.log("Tried changing API token to " + newToken + " but its already the active one!");
    } else {
      console.log("Changing API token to " + newToken);
      this.apiToken = newToken;
      this.iniChanged = true;
    }
  }

  changeAutoPolling(state) {
    if (state && this.getStatus().status === "stopped") {
      this.startPolling();
      console.log("Starting polling with " + this.pollingInterval);
      console.log("Auto Update activated.");
      this.iniChanged = true;
    } else if (!state && this.getStatus().status === "started") {
      this.stopPolling();
      console.log("Auto Update deactivated");
      this.iniChanged = true;
    } else {
      console.log("Tried to change Auto Update status but no changes were needed.");
    }
    this.storeIni();
  }

  changeLinked(state) {
    console.log("Changing link state to " + state);
    this.api.emit("linkchange", { isLinked: state });
    this.linked = state;
  }

  changeOverridden(state) {
    console.log("Changing override state to " + state);
    this.api.emit("overrchange", { isOverridden: state });
    this.overridden = state;
    if (this.overridden === true) {

      const weatherID = this.overrides[1][this.currentOverr];
      const cloudOverr = this.overrides[2][this.currentOverr];
      this.realityWorldAPI
        .setNodeProperty({
          NodePath: this.nodeName,
          PropertyPath: "Weather Data//WeatherID/0",
          Value: weatherID,
        })
        .catch((ex) => console.trace(ex));
      this.realityWorldAPI
        .setNodeProperty({
          NodePath: this.nodeName,
          PropertyPath: "Weather Data//CloudCoverage/0",
          Value: cloudOverr,
        })
        .catch((ex) => console.trace(ex));
    }
  }

  changeCurrentOverr(id) {
    console.log("Changing override ID to " + id);
    const weatherID = this.overrides[1][id];
    const cloudOverr = this.overrides[2][id];
    this.api.emit("currentOverrchange", { currentOverr: id });
    this.currentOverr = id;
    this.iniChanged = true;
    if (this.overridden === true) {
      this.realityWorldAPI
        .setNodeProperty({
          NodePath: this.nodeName,
          PropertyPath: "Weather Data//WeatherID/0",
          Value: weatherID,
        })
        .catch((ex) => console.trace(ex));
      this.realityWorldAPI
        .setNodeProperty({
          NodePath: this.nodeName,
          PropertyPath: "Weather Data//CloudCoverage/0",
          Value: cloudOverr,
        })
        .catch((ex) => console.trace(ex));
    }

  }

  stopPolling() {
    if (!this.pollTimer) return;

    clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.api.emit("statuschange", { status: "stopped" });
  }

  getStatus() {
    return {
      status: !!this.pollTimer ? "started" : "stopped",
    };
  }

  emitCurrentWeatherData() {
    if (this.currentWeatherData != null)
      this.api.emit("weatherdata", JSON.parse(this.currentWeatherData));
  }

  emitFavs() {
    this.api.emit("favs", this.favs);
    console.log("Sending Favs: " + this.favs);
  }

  isLinked() {
    return this.linked;
  }

  isOverridden() {
    return this.overridden;
  }

  getToken() {
    return this.apiToken;
  }

  getPollingInterval() {
    console.log("Sending pollingInteval = " + this.pollingInterval);
    return {
      pollInterval: this.pollingInterval,
    };
  }

  getCityID() {
    return this.cityID;
  }

  getCurrentOverr() {
    return this.currentOverr;
  }

  getOverrides() {
    return this.overrides;
  }

  //send updates to the nodegraph
  async sendUpdate(weatherdata) {
    const dateISOTime = new Date(
      Date.now() + (weatherdata.timezone / 60) * 60000
    ).toISOString();
    const sunriseTime = weatherdata.sys.sunrise;
    const sunriseDateISO = new Date(
      (sunriseTime + weatherdata.timezone) * 1000
    ).toISOString();
    const sunsetTime = weatherdata.sys.sunset;
    const sunsetDateISO = new Date(
      (sunsetTime + weatherdata.timezone) * 1000
    ).toISOString();

    var d = new Date();
    console.log(`${d.toLocaleTimeString()}: Sending data to nodegraph...`);

    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "City Info//CityName/0",
        Value: weatherdata.name,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "City Info//CityID/0",
        Value: weatherdata.id,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "City Info//Time/0",
        Value: dateISOTime,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "City Info//SunriseTime/0",
        Value: sunriseDateISO,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "City Info//SunsetTime/0",
        Value: sunsetDateISO,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "City Info//Timezone/0",
        Value: weatherdata.timezone / 3600,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "City Info//Latitude/0",
        Value: weatherdata.coord.lat,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "City Info//Longitude/0",
        Value: weatherdata.coord.lon,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "Weather Data//Temperature/0",
        Value: weatherdata.main.temp,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "Weather Data//Humidity/0",
        Value: weatherdata.main.humidity,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "Weather Data//Pressure/0",
        Value: weatherdata.main.pressure,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "Weather Data//WindSpeed/0",
        Value: weatherdata.wind.speed,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "Weather Data//WindDirection/0",
        Value: weatherdata.wind.deg,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: this.nodeName,
        PropertyPath: "Weather Data//Weather/0",
        Value: weatherdata.weather[0].main,
      })
      .catch((ex) => console.trace(ex));
    if (this.overridden === true) {
      const weatherID = this.overrides[1][this.currentOverr];
      this.realityWorldAPI
        .setNodeProperty({
          NodePath: this.nodeName,
          PropertyPath: "Weather Data//WeatherID/0",
          Value: weatherID,
        })
        .catch((ex) => console.trace(ex));
      console.log("Sending overridden weatherID: " + this.currentOverr);
      const cloudOverr = this.overrides[2][this.currentOverr];
      this.realityWorldAPI
        .setNodeProperty({
          NodePath: this.nodeName,
          PropertyPath: "Weather Data//CloudCoverage/0",
          Value: cloudOverr,
        })
        .catch((ex) => console.trace(ex));
    } else {
      this.realityWorldAPI
        .setNodeProperty({
          NodePath: this.nodeName,
          PropertyPath: "Weather Data//WeatherID/0",
          Value: weatherdata.weather[0].id,
        })
        .catch((ex) => console.trace(ex));
      console.log("Sending weatherID: " + weatherdata.weather[0].id);
      this.realityWorldAPI
        .setNodeProperty({
          NodePath: this.nodeName,
          PropertyPath: "Weather Data//CloudCoverage/0",
          Value: weatherdata.clouds.all,
        })
        .catch((ex) => console.trace(ex));
    }
  }

  async sendStatusMessage(message) {
    this.api.emit("statusMessage", { message: message });
  }

  validateWeatherResp(weatherResp) {
    if (weatherResp.status != 200) {
      console.log("Error in API response!");
      this.sendStatusMessage(weatherResp.status + " " + weatherResp.statusText);
    }
    return weatherResp.status === 200;
  }

  //Main polling function
  async poll() {
    this.pollTimer = setTimeout(
      this.poll.bind(this),
      this.pollingInterval * 1000
    );

    //get weatherdata from Open Weather API
    try {
      const weatherResp = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?id=${this.cityID}&mode=json&units=metric&appid=${this.apiToken}`
      );
      const weatherDataJSON = await weatherResp.text();
      this.isValidWeatherResp = this.validateWeatherResp(weatherResp);

      if (this.isValidWeatherResp) {
        this.sendStatusMessage("Weather Data received.");

        //write the whole response in the Weather Control node
        // await this.sendNodeProperty("KSTWC", "Default//Raw JSON/0", weatherDataJSON);
        const weatherDataParsed = JSON.parse(weatherDataJSON);
        if (this.linked) await this.sendUpdate(weatherDataParsed);

        this.currentWeatherData = weatherDataJSON;
        this.api.emit("weatherdata", weatherDataParsed);
        this.city = weatherDataParsed.name;
        this.currentWeatherID = weatherDataParsed.weather[0].id;
        this.currentCloudiness = weatherDataParsed.clouds.all;
        this.storeIni();
      }
    } catch (ex) {
      const status = ex.message.split("reason: ");
      if (status[1] == "getaddrinfo ENOTFOUND api.openweathermap.org") {
        this.sendStatusMessage("Cant reach openweathermap.org");
      } else {
        this.sendStatusMessage(status[1]);
      }
      console.error(ex.message);
    }
  }
}

const kstWCBackend = new KSTWCBackend();
kstWCBackend.init();
