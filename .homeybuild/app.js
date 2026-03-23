'use strict';

const Homey = require('homey');
const AquacellApi = require('./lib/AquacellApi');

class AquacellApp extends Homey.App {

  async onInit() {
    this.log('AquaCell App is running...');
    this.api = new AquacellApi();
  }

  getApi() {
    return this.api;
  }

}

module.exports = AquacellApp;
