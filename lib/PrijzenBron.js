'use strict';

const https = require('https');
const { vanDag, reeks } = require('./prijzen');

const API_URL = 'https://hub.solarbuffer.nl/v1/energieprijzen';
const UUR = 3600000;
const KWARTIER = 900000;

function haal() {
  return new Promise((resolve, reject) => {
    const req = https.get(API_URL, { headers: { Accept: 'application/json' }, timeout: 20000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`server gaf ${res.statusCode}`));
        try {
          const data = JSON.parse(body);
          if (!Array.isArray(data.uren)) throw new Error('onverwacht antwoord');
          return resolve(data);
        } catch (err) {
          return reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('time-out')));
    req.on('error', reject);
  });
}

/**
 * Eén bron voor alle apparaten: wie drie leveranciers toevoegt, doet toch
 * maar één verzoek. Het antwoord bevat ze allemaal al.
 *
 * Een keer per uur ophalen is genoeg, want de prijzen staan uren vooruit
 * vast. De prijzen van morgen komen rond 13:00; tot ze binnen zijn kijken we
 * tussen 13:00 en 15:00 elk kwartier. Lukt ophalen een keer niet, dan
 * blijven de laatste prijzen gelden.
 */
class PrijzenBron {

  constructor(homey) {
    this.homey = homey;
    this.data = null;
    this.luisteraars = new Set();
    this.ophaalTimer = null;
    this.uurTimer = null;
  }

  async start() {
    await this.ververs();
    this.planUurtik();
  }

  stop() {
    this.homey.clearTimeout(this.ophaalTimer);
    this.homey.clearTimeout(this.uurTimer);
  }

  luister(fn) {
    this.luisteraars.add(fn);
    if (this.data) fn('data');
    return () => this.luisteraars.delete(fn);
  }

  meld(reden) {
    for (const fn of this.luisteraars) {
      try { fn(reden); } catch (err) { this.homey.error(err); }
    }
  }

  morgenBinnen(data = this.data) {
    return Boolean(data) && vanDag(reeks(data.uren, null), new Date(), 1).length > 0;
  }

  async ververs() {
    const hadMorgen = this.morgenBinnen();
    try {
      this.data = await haal();
      this.homey.log(`prijzen opgehaald, ${this.data.uren.length} uren`);
      this.meld(!hadMorgen && this.morgenBinnen() ? 'morgen' : 'data');
    } catch (err) {
      this.homey.error(`prijzen ophalen mislukt: ${err.message}${this.data ? ', de laatste prijzen blijven gelden' : ''}`);
    }
    this.planOphalen();
  }

  planOphalen() {
    this.homey.clearTimeout(this.ophaalTimer);
    const nu = new Date();
    const uur = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: 'numeric', hourCycle: 'h23' }).format(nu));
    const minuut = nu.getUTCMinutes();
    let wacht = UUR;
    if (!this.data) {
      wacht = 5 * 60000;
    } else if (!this.morgenBinnen()) {
      if (uur >= 13 && uur < 15) wacht = KWARTIER;
      else if (uur === 12) wacht = (60 - minuut) * 60000 + 30000;
    }
    this.ophaalTimer = this.homey.setTimeout(() => this.ververs(), wacht);
  }

  /** Elk heel uur de apparaten bijwerken, daar is geen verzoek voor nodig. */
  planUurtik() {
    this.homey.clearTimeout(this.uurTimer);
    const nu = Date.now();
    const wacht = UUR - (nu % UUR) + 1000;
    this.uurTimer = this.homey.setTimeout(() => {
      this.meld('uur');
      this.planUurtik();
    }, wacht);
  }

}

module.exports = PrijzenBron;
