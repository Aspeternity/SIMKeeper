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
};

export function getCommonCarriers(countryCode: string) {
  return COMMON_CARRIERS[countryCode.toUpperCase()] ?? [];
}
