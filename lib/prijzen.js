'use strict';

/**
 * De rekenkern: wat de server stuurt omzetten in prijzen per uur, en daaruit
 * halen wat nu geldt. Zonder Homey erin, zodat het los te testen is.
 *
 * De server geeft bij elk uur ook de Nederlandse dag en het uur mee. Daar
 * groeperen we op, want een Homey kan in elke tijdzone staan terwijl deze
 * prijzen Nederlandse dagen volgen.
 */

const TIJDZONE = 'Europe/Amsterdam';

function vandaagNl(nu = new Date(), dagenVerder = 0) {
  const d = new Date(nu.getTime() + dagenVerder * 86400000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIJDZONE }).format(d);
}

/**
 * Uren van de server plus een prijs per uur in euro. Met prijzenCt (van een
 * leverancier) horen die op dezelfde plek als de uren; zonder nemen we de
 * kale beursprijs van het uur zelf.
 */
function reeks(uren, prijzenCt) {
  const uit = [];
  (uren || []).forEach((u, i) => {
    const start = Date.parse(u.t);
    if (Number.isNaN(start)) return;
    const ct = prijzenCt ? prijzenCt[i] : u.markt_ct;
    if (ct === null || ct === undefined) return;
    const volgende = uren[i + 1] ? Date.parse(uren[i + 1].t) : NaN;
    const eind = volgende > start ? volgende : start + 3600000;
    uit.push({
      start, eind, dag: u.dag, uur: u.uur, prijs: Math.round(Number(ct) * 1000) / 100000,
    });
  });
  return uit;
}

function opMoment(r, nu = Date.now()) {
  return r.find((u) => u.start <= nu && nu < u.eind) || null;
}

function vanDag(r, nu = new Date(), dagenVerder = 0) {
  const dag = vandaagNl(nu, dagenVerder);
  return r.filter((u) => u.dag === dag);
}

function vanafNu(r, nu = Date.now()) {
  return r.filter((u) => u.eind > nu);
}

const laagste = (r) => (r.length ? r.reduce((a, b) => (b.prijs < a.prijs ? b : a)) : null);
const hoogste = (r) => (r.length ? r.reduce((a, b) => (b.prijs > a.prijs ? b : a)) : null);
const gemiddeld = (r) => (r.length ? Math.round((r.reduce((s, u) => s + u.prijs, 0) / r.length) * 100000) / 100000 : null);

/** Plaats van dit uur in de dag: 1 is het goedkoopste uur. */
function rangVandaag(r, nu = new Date()) {
  const dag = vanDag(r, nu);
  const huidig = opMoment(dag, nu.getTime());
  if (!huidig) return null;
  return 1 + dag.filter((u) => u.prijs < huidig.prijs).length;
}

/** Plaats van dit uur in de dag van achteren: 1 is het duurste uur. */
function rangDuurVandaag(r, nu = new Date()) {
  const dag = vanDag(r, nu);
  const huidig = opMoment(dag, nu.getTime());
  if (!huidig) return null;
  return 1 + dag.filter((u) => u.prijs > huidig.prijs).length;
}

function uurTekst(u) {
  if (!u) return null;
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: TIJDZONE, hour: '2-digit', minute: '2-digit',
  }).format(new Date(u.start));
}

module.exports = {
  TIJDZONE, vandaagNl, reeks, opMoment, vanDag, vanafNu, laagste, hoogste, gemiddeld,
  rangVandaag, rangDuurVandaag, uurTekst,
};
