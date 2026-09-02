export type CarrierCatalogEntry = {
  name: string;
  website: string;
};

export const COMMON_CARRIERS: Record<string, CarrierCatalogEntry[]> = {
  CN: [
    { name: "中国移动", website: "https://www.10086.cn/" },
    { name: "中国联通", website: "https://www.10010.com/" },
    { name: "中国电信", website: "https://www.189.cn/" },
  ],
  HK: [
    { name: "csl.", website: "https://www.hkcsl.com/" },
    { name: "3 Hong Kong", website: "https://www.three.com.hk/" },
    { name: "SmarTone", website: "https://www.smartone.com/" },
    { name: "China Mobile Hong Kong", website: "https://www.hk.chinamobile.com/" },
  ],
  TW: [
    { name: "中華電信", website: "https://www.cht.com.tw/home/consumer" },
    { name: "台灣大哥大", website: "https://www.taiwanmobile.com.tw/" },
    { name: "遠傳電信", website: "https://www.fetnet.net/" },
  ],
  PH: [
    { name: "Globe", website: "https://www.globe.com.ph/" },
    { name: "Smart", website: "https://smart.com.ph/" },
    { name: "DITO", website: "https://dito.ph/" },
  ],
  SG: [
    { name: "Singtel", website: "https://www.singtel.com/" },
    { name: "StarHub", website: "https://www.starhub.com/" },
    { name: "M1", website: "https://www.m1.com.sg/" },
    { name: "SIMBA", website: "https://www.simba.sg/" },
  ],
  MY: [
    { name: "Maxis", website: "https://www.maxis.com.my/" },
    { name: "CelcomDigi", website: "https://www.celcomdigi.com/" },
    { name: "U Mobile", website: "https://www.u.com.my/" },
  ],
  TH: [
    { name: "AIS", website: "https://www.ais.th/" },
    { name: "True", website: "https://true.th/" },
    { name: "dtac", website: "https://www.dtac.co.th/" },
  ],
  ID: [
    { name: "Telkomsel", website: "https://www.telkomsel.com/" },
    { name: "IM3", website: "https://im3.id/" },
    { name: "XL Axiata", website: "https://www.xl.co.id/" },
    { name: "Smartfren", website: "https://www.smartfren.com/" },
  ],
  VN: [
    { name: "Viettel", website: "https://www.viettel.vn/" },
    { name: "VinaPhone", website: "https://vinaphone.com.vn/" },
    { name: "MobiFone", website: "https://www.mobifone.vn/" },
  ],
  KH: [
    { name: "Smart", website: "https://www.smart.com.kh/" },
    { name: "Cellcard", website: "https://www.cellcard.com.kh/" },
    { name: "Metfone", website: "https://metfone.com.kh/" },
  ],
  JP: [
    { name: "NTT DOCOMO", website: "https://www.docomo.ne.jp/" },
    { name: "au", website: "https://www.au.com/" },
    { name: "SoftBank", website: "https://www.softbank.jp/mobile/" },
    { name: "Rakuten Mobile", website: "https://network.mobile.rakuten.co.jp/" },
  ],
  KR: [
    { name: "SK Telecom", website: "https://www.tworld.co.kr/" },
    { name: "KT", website: "https://www.kt.com/" },
    { name: "LG U+", website: "https://www.lguplus.com/" },
  ],

  GB: [
    { name: "EE", website: "https://ee.co.uk/" },
    { name: "O2", website: "https://www.o2.co.uk/" },
    { name: "Vodafone", website: "https://www.vodafone.co.uk/" },
    { name: "Three", website: "https://www.three.co.uk/" },
    { name: "giffgaff", website: "https://www.giffgaff.com/" },
    { name: "VOXI", website: "https://www.voxi.co.uk/" },
    { name: "SMARTY", website: "https://smarty.co.uk/" },
  ],
  DE: [
    { name: "Telekom", website: "https://www.telekom.de/" },
    { name: "Vodafone", website: "https://www.vodafone.de/" },
    { name: "O2", website: "https://www.o2online.de/" },
  ],
  FR: [
    { name: "Orange", website: "https://www.orange.fr/" },
    { name: "SFR", website: "https://www.sfr.fr/" },
    { name: "Bouygues Telecom", website: "https://www.bouyguestelecom.fr/" },
    { name: "Free Mobile", website: "https://mobile.free.fr/" },
  ],
  ES: [
    { name: "Movistar", website: "https://www.movistar.es/" },
    { name: "Orange", website: "https://www.orange.es/" },
    { name: "Vodafone", website: "https://www.vodafone.es/" },
    { name: "Yoigo", website: "https://www.yoigo.com/" },
  ],
  IT: [
    { name: "TIM", website: "https://www.tim.it/" },
    { name: "WINDTRE", website: "https://www.windtre.it/" },
    { name: "iliad", website: "https://www.iliad.it/" },
    { name: "Fastweb", website: "https://www.fastweb.it/" },
    { name: "Vodafone", website: "https://privati.vodafone.it/" },
    { name: "ho. Mobile", website: "https://www.ho-mobile.it/" },
  ],
  NL: [
    { name: "KPN", website: "https://www.kpn.com/" },
    { name: "Vodafone", website: "https://www.vodafone.nl/" },
    { name: "Odido", website: "https://www.odido.nl/" },
  ],
  CH: [
    { name: "Swisscom", website: "https://www.swisscom.ch/" },
    { name: "Sunrise", website: "https://www.sunrise.ch/" },
    { name: "Salt", website: "https://www.salt.ch/" },
  ],
  AT: [
    { name: "A1", website: "https://www.a1.net/" },
    { name: "Magenta", website: "https://www.magenta.at/" },
    { name: "Drei", website: "https://www.drei.at/" },
  ],
  IE: [
    { name: "Vodafone", website: "https://n.vodafone.ie/" },
    { name: "Three", website: "https://www.three.ie/" },
    { name: "eir", website: "https://eir.ie/" },
  ],
  PL: [
    { name: "Orange", website: "https://www.orange.pl/" },
    { name: "Play", website: "https://www.play.pl/" },
    { name: "T-Mobile", website: "https://www.t-mobile.pl/" },
    { name: "Plus", website: "https://www.plus.pl/" },
  ],

  AE: [
    { name: "e& UAE", website: "https://www.etisalat.ae/" },
    { name: "du", website: "https://www.du.ae/" },
    { name: "Virgin Mobile UAE", website: "https://www.virginmobile.ae/" },
  ],
  SA: [
    { name: "stc", website: "https://www.stc.com.sa/" },
    { name: "Mobily", website: "https://www.mobily.com.sa/" },
    { name: "Zain", website: "https://sa.zain.com/" },
  ],
  QA: [
    { name: "Ooredoo", website: "https://www.ooredoo.qa/" },
    { name: "Vodafone Qatar", website: "https://www.vodafone.qa/" },
  ],
  TR: [
    { name: "Turkcell", website: "https://www.turkcell.com.tr/" },
    { name: "Vodafone", website: "https://www.vodafone.com.tr/" },
    { name: "Türk Telekom", website: "https://www.turktelekom.com.tr/" },
  ],

  US: [
    { name: "T-Mobile", website: "https://www.t-mobile.com/" },
    { name: "AT&T", website: "https://www.att.com/" },
    { name: "Verizon", website: "https://www.verizon.com/" },
  ],
  CA: [
    { name: "Rogers", website: "https://www.rogers.com/" },
    { name: "Bell", website: "https://www.bell.ca/" },
    { name: "TELUS", website: "https://www.telus.com/" },
  ],
  MX: [
    { name: "Telcel", website: "https://www.telcel.com/" },
    { name: "AT&T México", website: "https://www.att.com.mx/" },
    { name: "Movistar", website: "https://www.movistar.com.mx/" },
  ],
  BR: [
    { name: "Vivo", website: "https://vivo.com.br/" },
    { name: "Claro", website: "https://www.claro.com.br/" },
    { name: "TIM", website: "https://www.tim.com.br/" },
  ],

  AU: [
    { name: "Telstra", website: "https://www.telstra.com.au/" },
    { name: "Optus", website: "https://www.optus.com.au/" },
    { name: "Vodafone", website: "https://www.vodafone.com.au/" },
  ],
  NZ: [
    { name: "Spark", website: "https://www.spark.co.nz/" },
    { name: "One NZ", website: "https://one.nz/" },
    { name: "2degrees", website: "https://www.2degrees.nz/" },
  ],

  NG: [
    { name: "MTN", website: "https://www.mtn.ng/" },
    { name: "Airtel", website: "https://www.airtel.com.ng/" },
    { name: "Glo", website: "https://www.gloworld.com/" },
    { name: "9mobile", website: "https://9mobile.com.ng/" },
  ],
  ZA: [
    { name: "Vodacom", website: "https://www.vodacom.co.za/" },
    { name: "MTN", website: "https://www.mtn.co.za/" },
    { name: "Telkom", website: "https://www.telkom.co.za/" },
    { name: "Cell C", website: "https://www.cellc.co.za/" },
  ],
  EG: [
    { name: "Vodafone", website: "https://web.vodafone.com.eg/" },
    { name: "Orange", website: "https://www.orange.eg/" },
    { name: "e& Egypt", website: "https://www.etisalat.eg/" },
    { name: "WE", website: "https://www.te.eg/" },
  ],
  KE: [
    { name: "Safaricom", website: "https://www.safaricom.co.ke/" },
    { name: "Airtel", website: "https://www.airtelkenya.com/" },
    { name: "Telkom Kenya", website: "https://telkom.co.ke/" },
  ],
};

export function getCommonCarriers(countryCode: string) {
  return COMMON_CARRIERS[countryCode.toUpperCase()] ?? [];
}
