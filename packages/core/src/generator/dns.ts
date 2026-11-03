/**
 * DNS 配置生成器
 */

import type { DNSConfig } from "@subboost/core/types/config";

/** 国内 DoH：国内域名解析、代理节点域名解析、直连出站解析 */
const CN_DOH_NAMESERVERS = ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"];
/** 海外 DoH：配合 respect-rules 按分流规则经代理查询，避免海外域名泄露给国内 DNS */
const GLOBAL_DOH_NAMESERVERS = ["https://dns.cloudflare.com/dns-query", "https://dns.google/dns-query"];

/**
 * 默认 DNS：国内外严格分流。
 * - 国内/私有域名（geosite:private,cn）只问国内 DoH，拿到国内最优 CDN IP
 * - 其余域名只问海外 DoH，且 respect-rules 让查询按规则走代理，不直连、不泄露
 * - 直连出站与代理节点域名使用国内 DoH，代理节点不可用时国内服务仍可正常解析
 * - 不再使用 fallback / fallback-filter：fallback 中的海外 DoH 直连在国内常被阻断，会拖慢解析
 */
export const DEFAULT_DNS_CONFIG: DNSConfig = {
  enable: true,
  listen: "127.0.0.1:5335",
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "use-system-hosts": false,
  "respect-rules": true,
  "default-nameserver": ["223.5.5.5", "119.29.29.29"],
  "proxy-server-nameserver": [...CN_DOH_NAMESERVERS],
  "direct-nameserver": [...CN_DOH_NAMESERVERS],
  "nameserver-policy": {
    "geosite:private,cn": [...CN_DOH_NAMESERVERS],
  },
  nameserver: [...GLOBAL_DOH_NAMESERVERS],
  "fake-ip-filter": [
    "geosite:private",
    "*.lan",
    "stun.*.*.*",
    "stun.*.*",
    "time.windows.com",
    "time.nist.gov",
    "time.apple.com",
    "time.asia.apple.com",
    "*.ntp.org.cn",
    "*.openwrt.pool.ntp.org",
    "time1.cloud.tencent.com",
    "time.ustc.edu.cn",
    "pool.ntp.org",
    "ntp.ubuntu.com",
    "ntp.aliyun.com",
    "ntp1.aliyun.com",
    "ntp2.aliyun.com",
    "ntp3.aliyun.com",
    "ntp4.aliyun.com",
    "ntp5.aliyun.com",
    "ntp6.aliyun.com",
    "ntp7.aliyun.com",
    "time1.aliyun.com",
    "time2.aliyun.com",
    "time3.aliyun.com",
    "time4.aliyun.com",
    "time5.aliyun.com",
    "time6.aliyun.com",
    "time7.aliyun.com",
    "*.time.edu.cn",
    "time1.apple.com",
    "time2.apple.com",
    "time3.apple.com",
    "time4.apple.com",
    "time5.apple.com",
    "time6.apple.com",
    "time7.apple.com",
    "time1.google.com",
    "time2.google.com",
    "time3.google.com",
    "time4.google.com",
    "music.163.com",
    "*.music.163.com",
    "*.126.net",
    "musicapi.taihe.com",
    "music.taihe.com",
    "songsearch.kugou.com",
    "trackercdn.kugou.com",
    "*.kuwo.cn",
    "api-jooxtt.sanook.com",
    "api.joox.com",
    "joox.com",
    "y.qq.com",
    "*.y.qq.com",
    "streamoc.music.tc.qq.com",
    "mobileoc.music.tc.qq.com",
    "isure.stream.qqmusic.qq.com",
    "dl.stream.qqmusic.qq.com",
    "aqqmusic.tc.qq.com",
    "amobile.music.tc.qq.com",
    "*.xiami.com",
    "*.music.migu.cn",
    "music.migu.cn",
    "*.msftconnecttest.com",
    "*.msftncsi.com",
    "localhost.ptlogin2.qq.com",
    "*.*.*.srv.nintendo.net",
    "*.*.stun.playstation.net",
    "xbox.*.*.microsoft.com",
    "*.ipv6.microsoft.com",
    "*.*.xboxlive.com",
    "speedtest.cros.wr.pvp.net",
  ],
};

/**
 * 2.12 之前的默认 DNS（国内外 DNS 混用 + fallback）。
 * 仅用于识别"从未改动过默认 DNS"的已保存配置，并迁移到 DEFAULT_DNS_CONFIG。
 */
export const LEGACY_DEFAULT_DNS_CONFIG_V1: DNSConfig = {
  enable: true,
  listen: "127.0.0.1:5335",
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "use-system-hosts": false,
  "default-nameserver": [
    "180.76.76.76",
    "182.254.118.118",
    "8.8.8.8",
    "180.184.2.2",
  ],
  nameserver: [
    "180.76.76.76",
    "119.29.29.29",
    "180.184.1.1",
    "223.5.5.5",
    "8.8.8.8",
    "https://223.6.6.6/dns-query#h3=true",
    "https://dns.alidns.com/dns-query",
    "https://cloudflare-dns.com/dns-query",
    "https://doh.pub/dns-query",
  ],
  fallback: [
    "https://dns.quad9.net/dns-query",
    "https://dns.alidns.com/dns-query",
    "https://doh.pub/dns-query",
    "https://public.dns.iij.jp/dns-query",
    "https://101.101.101.101/dns-query",
    "https://208.67.220.220/dns-query",
    "tls://8.8.4.4",
    "tls://1.0.0.1:853",
    "https://cloudflare-dns.com/dns-query",
    "https://dns.google/dns-query",
  ],
  "fallback-filter": {
    geoip: true,
    ipcidr: ["240.0.0.0/4", "0.0.0.0/32", "127.0.0.1/32"],
    domain: [
      "+.google.com",
      "+.facebook.com",
      "+.twitter.com",
      "+.youtube.com",
      "+.xn--ngstr-lra8j.com",
      "+.google.cn",
      "+.googleapis.cn",
      "+.googleapis.com",
      "+.gvt1.com",
    ],
  },
  "fake-ip-filter": [
    "*.lan",
    "stun.*.*.*",
    "stun.*.*",
    "time.windows.com",
    "time.nist.gov",
    "time.apple.com",
    "time.asia.apple.com",
    "*.ntp.org.cn",
    "*.openwrt.pool.ntp.org",
    "time1.cloud.tencent.com",
    "time.ustc.edu.cn",
    "pool.ntp.org",
    "ntp.ubuntu.com",
    "ntp.aliyun.com",
    "ntp1.aliyun.com",
    "ntp2.aliyun.com",
    "ntp3.aliyun.com",
    "ntp4.aliyun.com",
    "ntp5.aliyun.com",
    "ntp6.aliyun.com",
    "ntp7.aliyun.com",
    "time1.aliyun.com",
    "time2.aliyun.com",
    "time3.aliyun.com",
    "time4.aliyun.com",
    "time5.aliyun.com",
    "time6.aliyun.com",
    "time7.aliyun.com",
    "*.time.edu.cn",
    "time1.apple.com",
    "time2.apple.com",
    "time3.apple.com",
    "time4.apple.com",
    "time5.apple.com",
    "time6.apple.com",
    "time7.apple.com",
    "time1.google.com",
    "time2.google.com",
    "time3.google.com",
    "time4.google.com",
    "music.163.com",
    "*.music.163.com",
    "*.126.net",
    "musicapi.taihe.com",
    "music.taihe.com",
    "songsearch.kugou.com",
    "trackercdn.kugou.com",
    "*.kuwo.cn",
    "api-jooxtt.sanook.com",
    "api.joox.com",
    "joox.com",
    "y.qq.com",
    "*.y.qq.com",
    "streamoc.music.tc.qq.com",
    "mobileoc.music.tc.qq.com",
    "isure.stream.qqmusic.qq.com",
    "dl.stream.qqmusic.qq.com",
    "aqqmusic.tc.qq.com",
    "amobile.music.tc.qq.com",
    "*.xiami.com",
    "*.music.migu.cn",
    "music.migu.cn",
    "*.msftconnecttest.com",
    "*.msftncsi.com",
    "localhost.ptlogin2.qq.com",
    "*.*.*.srv.nintendo.net",
    "*.*.stun.playstation.net",
    "xbox.*.*.microsoft.com",
    "*.ipv6.microsoft.com",
    "*.*.xboxlive.com",
    "speedtest.cros.wr.pvp.net",
  ],
};

function isSameJsonValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => isSameJsonValue(item, right[index]))
    );
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left);
    const rightRecord = right as Record<string, unknown>;
    return (
      leftKeys.length === Object.keys(rightRecord).length &&
      leftKeys.every((key) => key in rightRecord && isSameJsonValue((left as Record<string, unknown>)[key], rightRecord[key]))
    );
  }
  return left === right;
}

/** 已保存的 dns 段与旧默认值完全一致（用户从未改过）时返回 true。 */
export function isLegacyDefaultDnsConfig(dns: unknown): boolean {
  return isSameJsonValue(dns, LEGACY_DEFAULT_DNS_CONFIG_V1);
}
