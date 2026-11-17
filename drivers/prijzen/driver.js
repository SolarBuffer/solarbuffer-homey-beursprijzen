'use strict';

const Homey = require('homey');
const P = require('../../lib/prijzen');

const ALLEEN_BEURS = '__beurs__';

class PrijzenDriver extends Homey.Driver {

  async onInit() {
    const kaart = (id) => this.homey.flow.getDeviceTriggerCard(id);
    this.triggers = {
      veranderd: kaart('prijs_veranderd'),
      goedkoopste: kaart('goedkoopste_uur_begint'),
      duurste: kaart('duurste_uur_begint'),
      morgen: kaart('prijzen_morgen_binnen'),
    };

    const voorwaarde = (id, fn) => this.homey.flow.getConditionCard(id)
      .registerRunListener((args) => fn(args.device, args));

    voorwaarde('prijs_lager_dan', (device, args) => {
      const nu = device.stroomNu();
      if (!nu) throw new Error('Geen prijs voor dit uur');
      return nu.prijs < Number(args.bedrag);
    });
    voorwaarde('goedkoopste_uren', (device, args) => {
      const rang = P.rangVandaag(device.stroom());
      if (rang === null) throw new Error('Geen prijs voor dit uur');
      return rang <= Number(args.aantal);
    });
    voorwaarde('duurste_uren', (device, args) => {
      const rang = P.rangDuurVandaag(device.stroom());
      if (rang === null) throw new Error('Geen prijs voor dit uur');
      return rang <= Number(args.aantal);
    });
    voorwaarde('onder_gemiddelde', (device) => {
      const nu = device.stroomNu();
      const gem = P.gemiddeld(P.vanDag(device.stroom()));
      if (!nu || gem === null) throw new Error('Geen prijs voor dit uur');
      return nu.prijs < gem;
    });
  }

  /** Elke leverancier is een apparaat dat je kunt toevoegen. */
  async onPairListDevices() {
    const { bron } = this.homey.app;
    if (!bron.data) await bron.ververs();
    if (!bron.data) throw new Error(this.homey.__('pair.geen_verbinding'));
    const namen = (bron.data.leveranciers || []).map((l) => l.naam).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'nl'));
    return [
      { name: this.homey.__('pair.alleen_beurs'), data: { id: ALLEEN_BEURS }, store: { leverancier: ALLEEN_BEURS } },
      ...namen.map((naam) => ({ name: naam, data: { id: naam }, store: { leverancier: naam } })),
    ];
  }

}

PrijzenDriver.ALLEEN_BEURS = ALLEEN_BEURS;
module.exports = PrijzenDriver;
