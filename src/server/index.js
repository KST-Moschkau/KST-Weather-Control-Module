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

const { BrokerClient } = require("@zerodensity/realityhub-api");
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");

const REALITY_HUB_PORT = process.env.REALITY_HUB_PORT || 80;

class KSTWCBackend {
  constructor() {
    this.pollingInterval = 10;
    this.cityID = null;
    this.pollTimer = null;
    this.apiToken = null;
    this.linked = false;
    this.iniData = require("./ini.json");
  }

  async initBroker() {
    this.brokerClient = await BrokerClient.initModule({
      menuTitle: "Weather Control",
      clientModuleName: "kst.wc_client",
      moduleName: "kst.wc",
      serverURL: "http://172.16.1.130:5000/",
      hub: {
        host: "172.16.1.130",
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
        getToken: this.getToken,
        isLinked: this.isLinked,
        changePollingInterval: this.changePollingInterval,
        changeCityID: this.changeCityID,
        changeToken: this.changeToken,
        changeLinked: this.changeLinked,
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

    app.listen(5000, "0.0.0.0", () => {
      console.info("Weather Control backend started on port 5000");
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
    this.apiToken = this.iniData.APIToken;
    this.pollingInterval = this.iniData.UpdateInterval;
    console.log(
      "API initialized with CityID " +
        this.cityID +
        " ,APIToken " +
        this.apiToken +
        " and pollingInterval " +
        this.pollingInterval
    );
  }

  //save settings
  storeIni() {
    this.iniData.CityID = this.cityID;
    this.iniData.APIToken = this.apiToken;
    this.iniData.UpdateInterval = this.pollingInterval;
    this.iniData.AutoUpdating = this.getStatus().status == "started";
    const iniJSON = JSON.stringify(this.iniData);
    console.log(iniJSON);
    const fs = require("fs");
    fs.writeFile("./src/server/ini.json", iniJSON, "utf8", function (err) {
      if (err) {
        console.log("Cant write ini file!");
        return console.log(err);
      }
    });
    console.log("New ini saved.");
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
    console.log("Changing PollingInterval to " + newInterval);
    this.pollingInterval = newInterval;
    this.storeIni();
  }

  changeCityID(newID) {
    console.log("Changing city ID to " + newID);
    this.cityID = newID;
    if (this.getStatus().status == "stopped") {
      this.startPolling(this.pollingInterval);
      this.stopPolling();
    } else {
      this.stopPolling();
      this.startPolling(this.pollingInterval);
    }
    this.storeIni();
  }

  changeToken(newToken) {
    console.log("Changing API token to " + newToken);
    this.apiToken = newToken;
  }

  changeLinked(state) {
    console.log("Changing link state to " + state);
    this.api.emit("linkchange", { isLinked: state });
    this.linked = state;
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

  isLinked() {
    return this.linked;
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

  //send updates to the nodegraph
  async sendUpdate(weatherdata) {
    const nodeName = "KSTWC";

    const dateISOTime = new Date(
      Date.now() + (weatherdata.timezone / 60) * 60000
    ).toISOString();
    const sunriseTime = weatherdata.sys.sunrise;
    const sunriseDate = new Date(
      (sunriseTime + weatherdata.timezone - 3600) * 1000
    );
    const sunsetTime = weatherdata.sys.sunset;
    const sunsetDate = new Date(
      (sunsetTime + weatherdata.timezone - 3600) * 1000
    );

    /*this.realityWorldAPI.setNodeProperty({
      NodePath: nodeName,
      PropertyPath: "RAW Data//Raw JSON/0",
      Value: weatherdata,
    });
*/

    console.log("Sending data to nodegraph...");

    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "City Info//CityName/0",
        Value: weatherdata.name,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "City Info//CityID/0",
        Value: weatherdata.id,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "City Info//Time/0",
        Value: dateISOTime,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "City Info//Timezone/0",
        Value: weatherdata.timezone / 3600,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "City Info//Latitude/0",
        Value: weatherdata.coord.lat,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "City Info//Longitude/0",
        Value: weatherdata.coord.lon,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "Weather Data//Temperature/0",
        Value: weatherdata.main.temp,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "Weather Data//Humidity/0",
        Value: weatherdata.main.humidity,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "Weather Data//Pressure/0",
        Value: weatherdata.main.pressure,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "Weather Data//WindSpeed/0",
        Value: weatherdata.wind.speed,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "Weather Data//WindDirection/0",
        Value: weatherdata.wind.deg,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "Weather Data//Weather/0",
        Value: weatherdata.weather[0].main,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "Weather Data//WeatherID/0",
        Value: weatherdata.weather[0].id,
      })
      .catch((ex) => console.trace(ex));
    this.realityWorldAPI
      .setNodeProperty({
        NodePath: nodeName,
        PropertyPath: "Weather Data//CloudCoverage/0",
        Value: weatherdata.clouds.all,
      })
      .catch((ex) => console.trace(ex));
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

      //write the whole response in the Weather Control node
      // await this.sendNodeProperty("KSTWC", "Default//Raw JSON/0", weatherDataJSON);
      if (this.linked) await this.sendUpdate(JSON.parse(weatherDataJSON));

      this.api.emit("weatherdata", JSON.parse(weatherDataJSON));
    } catch (ex) {
      console.error(ex.message);
    }
  }
}

const kstWCBackend = new KSTWCBackend();
kstWCBackend.init();
