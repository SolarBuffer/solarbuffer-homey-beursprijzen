'use strict';

const Homey = require('homey');
const P = require('../../lib/prijzen');

const ALLEEN_BEURS = '__beurs__';

class PrijzenDevice extends Homey.Device {

  async onInit() {
    this.leverancier = this.getStoreValue('leverancier');
    this.vorigePrijs = null;
    this.stopLuisteren = this.homey.app.bron.luister((reden) => {
      this.bijwerken(reden).catch((err) => this.error(err));
    });
  }

  async onDeleted() {
    if (this.stopLuisteren) this.stopLuisteren();
  }

  async onUninit() {
    if (this.stopLuisteren) this.stopLuisteren();
  }

  get data() {
    return this.homey.app.bron.data;
  }

  gegevens() {
    if (this.leverancier === ALLEEN_BEURS || !this.data) return null;
    return (this.data.leveranciers || []).find((l) => l.naam === this.leverancier) || null;
  }

  stroom() {
    if (!this.data) return [];
    if (this.leverancier === ALLEEN_BEURS) return P.reeks(this.data.uren, null);
    const lev = this.gegevens();
    return lev ? P.reeks(this.data.uren, lev.prijzen_ct || []) : [];
  }

  gas() {
    if (!this.data) return [];
    if (this.leverancier === ALLEEN_BEURS) return P.reeks(this.data.gas_uren, null);
    const lev = this.gegevens();
    if (!lev || lev.gas_opslag_ct === null || lev.gas_opslag_ct === undefined) return [];
    return P.reeks(this.data.gas_uren, lev.gas_prijzen_ct || []);
  }

  stroomNu() {
    return P.opMoment(this.stroom());
  }

  async zet(cap, waarde) {
    if (!this.hasCapability(cap)) return;
    if (this.getCapabilityValue(cap) !== waarde) await this.setCapabilityValue(cap, waarde);
  }

  async bijwerken(reden) {
    if (!this.data) return;
    if (this.leverancier !== ALLEEN_BEURS && !this.gegevens()) {
      await this.setUnavailable(this.homey.__('device.leverancier_weg'));
      return;
    }
    await this.setAvailable();

    const r = this.stroom();
    const vandaag = P.vanDag(r);
    const komend = P.vanafNu(r);
    const nu = P.opMoment(r);
    const goedkoopst = P.laagste(komend);
    const duurst = P.hoogste(komend);

    await this.zet('sb_prijs', nu ? nu.prijs : null);
    await this.zet('sb_prijs.volgend_uur', komend[1] ? komend[1].prijs : null);
    await this.zet('sb_prijs.laagste', P.laagste(vandaag)?.prijs ?? null);
    await this.zet('sb_prijs.hoogste', P.hoogste(vandaag)?.prijs ?? null);
    await this.zet('sb_prijs.gemiddeld', P.gemiddeld(vandaag));
    await this.zet('sb_uur.goedkoopste', goedkoopst ? `${P.uurTekst(goedkoopst)} (€ ${goedkoopst.prijs.toFixed(3).replace('.', ',')})` : null);
    await this.zet('sb_uur.duurste', duurst ? `${P.uurTekst(duurst)} (€ ${duurst.prijs.toFixed(3).replace('.', ',')})` : null);
    await this.zet('sb_prijs.beurs', P.opMoment(P.reeks(this.data.uren, null))?.prijs ?? null);

    const gas = this.gas();
    if (gas.length) {
      if (!this.hasCapability('sb_gasprijs')) await this.addCapability('sb_gasprijs');
      await this.zet('sb_gasprijs', P.opMoment(gas)?.prijs ?? null);
    } else if (this.hasCapability('sb_gasprijs')) {
      await this.removeCapability('sb_gasprijs');
    }

    const { triggers } = this.driver;
    if (nu && reden !== 'morgen') {
      if (this.vorigePrijs !== null && nu.prijs !== this.vorigePrijs) {
        await triggers.veranderd.trigger(this, { prijs: nu.prijs });
      }
      if (reden === 'uur') {
        if (P.rangVandaag(r) === 1) await triggers.goedkoopste.trigger(this, { prijs: nu.prijs });
        if (P.rangDuurVandaag(r) === 1) await triggers.duurste.trigger(this, { prijs: nu.prijs });
      }
      this.vorigePrijs = nu.prijs;
    }
    if (reden === 'morgen') {
      const morgen = P.vanDag(r, new Date(), 1);
      if (morgen.length) {
        await triggers.morgen.trigger(this, { laagste: P.laagste(morgen).prijs, gemiddeld: P.gemiddeld(morgen) });
      }
    }
  }

}

module.exports = PrijzenDevice;
