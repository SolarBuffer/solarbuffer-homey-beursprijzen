'use strict';

const Homey = require('homey');
const PrijzenBron = require('./lib/PrijzenBron');

class BeursprijzenApp extends Homey.App {

  async onInit() {
    this.bron = new PrijzenBron(this.homey);
    await this.bron.start();
    this.log('SolarBuffer Beursprijzen gestart');
  }

  async onUninit() {
    this.bron.stop();
  }

}

module.exports = BeursprijzenApp;
