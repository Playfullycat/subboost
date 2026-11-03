import { describe, expect, it } from "vitest";
import { generateClashConfig } from "./index";
import { generateRules } from "./rules";
import { DEFAULT_DNS_CONFIG, LEGACY_DEFAULT_DNS_CONFIG_V1, isLegacyDefaultDnsConfig } from "./dns";
import { loadMihomoYaml } from "@subboost/core/config/yaml-schema";
import {
  DEFAULT_BASE_CONFIG_YAML,
  DEFAULT_SUBBOOST_CONFIG,
  LEGACY_DEFAULT_BASE_CONFIG_YAML_V1,
  migrateLegacyDefaultBaseConfigYaml,
} from "@subboost/core/config/defaults";
import {
  CN_IP_RULE_VERSION,
  readPersistedCnIpNoResolve,
  resolvePersistedCnIpNoResolve,
} from "@subboost/core/rules/cn-ip-rule";
import { DEFAULT_RULE_PROVIDER_BASE_URL, migrateLegacyRuleProviderBaseUrl } from "@subboost/core/rules/metadata";
import type { ParsedNode } from "@subboost/core/types/node";

const LEGACY_RULE_BASE_URL = "https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo";
const MODULES = ["select", "auto", "ad", "private", "cn", "ai", "google", "apple", "microsoft", "steam", "global", "final"];

const node = { name: "Node", type: "ss", server: "ss.example.com", port: 8388, cipher: "aes-128-gcm", password: "secret" } as ParsedNode;

function rules(options: Partial<Parameters<typeof generateRules>[0]> = {}) {
  return generateRules({
    enabledModules: MODULES,
    customRules: [],
    experimentalCnUseCnRuleSet: true,
    ...options,
  });
}

const indexOfRule = (list: string[], prefix: string) => list.findIndex((rule) => rule.startsWith(prefix));

describe("CN direct rule ordering", () => {
  it("puts every CN domain rule before foreign service rules", () => {
    const list = rules();
    const firstServiceRule = indexOfRule(list, "RULE-SET,openai,");
    for (const prefix of [
      "RULE-SET,geolocation-cn,",
      "RULE-SET,apple@cn,",
      "RULE-SET,microsoft@cn,",
      "RULE-SET,google@cn,",
      "RULE-SET,steam@cn,",
      "RULE-SET,category-games@cn,",
      "RULE-SET,amazon@cn,",
      "RULE-SET,cn,",
    ]) {
      const index = indexOfRule(list, prefix);
      expect(index, prefix).toBeGreaterThanOrEqual(0);
      expect(index, prefix).toBeLessThan(firstServiceRule);
    }
    expect(indexOfRule(list, "RULE-SET,apple@cn,")).toBeLessThan(indexOfRule(list, "RULE-SET,apple,"));
    expect(indexOfRule(list, "RULE-SET,microsoft@cn,")).toBeLessThan(indexOfRule(list, "RULE-SET,microsoft,"));
    expect(indexOfRule(list, "RULE-SET,cn,")).toBeLessThan(indexOfRule(list, "RULE-SET,geolocation-!cn,"));
  });

  it("defers the CN IP rule after all domain rules and resolves by default", () => {
    const list = rules();
    expect(list.at(-1)).toMatch(/^MATCH,/);
    expect(list.at(-2)).toBe("RULE-SET,cn-ip,🔒 国内服务");
    expect(indexOfRule(list, "RULE-SET,geolocation-!cn,")).toBeLessThan(list.length - 2);
    expect(DEFAULT_SUBBOOST_CONFIG.cnIpNoResolve).toBe(false);
  });

  it("keeps explicit no-resolve and private IP no-resolve", () => {
    const list = rules({ cnIpNoResolve: true });
    expect(list.at(-2)).toBe("RULE-SET,cn-ip,🔒 国内服务,no-resolve");
    expect(list.find((rule) => rule.startsWith("RULE-SET,private-ip,"))).toMatch(/,no-resolve$/);
  });

  it("keeps custom rules ahead of the CN rules", () => {
    const list = rules({
      customRules: [{ id: "c1", type: "DOMAIN-SUFFIX", value: "example.cn", target: "module:global" }],
    });
    expect(indexOfRule(list, "DOMAIN-SUFFIX,example.cn,")).toBeLessThan(indexOfRule(list, "RULE-SET,geolocation-cn,"));
    expect(indexOfRule(list, "DOMAIN-SUFFIX,example.cn,")).toBeGreaterThan(indexOfRule(list, "RULE-SET,private,"));
  });
});

describe("cnIpNoResolve persistence migration", () => {
  it("treats legacy true as unset and keeps versioned values", () => {
    expect(readPersistedCnIpNoResolve({ cnIpNoResolve: true })).toBeUndefined();
    expect(readPersistedCnIpNoResolve({ cnIpNoResolve: false })).toBe(false);
    expect(readPersistedCnIpNoResolve({ cnIpNoResolve: true, cnIpRuleVersion: CN_IP_RULE_VERSION })).toBe(true);
    expect(readPersistedCnIpNoResolve({})).toBeUndefined();
    expect(readPersistedCnIpNoResolve(null)).toBeUndefined();
  });

  it("falls back only when the field is missing", () => {
    expect(resolvePersistedCnIpNoResolve({}, true)).toBe(true);
    expect(resolvePersistedCnIpNoResolve({ cnIpNoResolve: true }, true)).toBe(false);
    expect(resolvePersistedCnIpNoResolve({ cnIpNoResolve: true, cnIpRuleVersion: CN_IP_RULE_VERSION }, false)).toBe(true);
  });
});

describe("default DNS", () => {
  it("separates CN and overseas resolvers without fallback", () => {
    expect(DEFAULT_DNS_CONFIG).toMatchObject({
      "respect-rules": true,
      "nameserver-policy": { "geosite:private,cn": ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"] },
      nameserver: ["https://dns.cloudflare.com/dns-query", "https://dns.google/dns-query"],
    });
    expect(DEFAULT_DNS_CONFIG).not.toHaveProperty("fallback");
    expect(DEFAULT_DNS_CONFIG).not.toHaveProperty("fallback-filter");
    expect(DEFAULT_DNS_CONFIG.nameserver).not.toContain("8.8.8.8");
    expect(DEFAULT_DNS_CONFIG["fake-ip-filter"]?.[0]).toBe("geosite:private");
  });

  it("keeps the editor YAML and the generated default in sync", () => {
    expect((loadMihomoYaml(DEFAULT_BASE_CONFIG_YAML) as { dns: unknown }).dns).toEqual(DEFAULT_DNS_CONFIG);
    expect(isLegacyDefaultDnsConfig((loadMihomoYaml(LEGACY_DEFAULT_BASE_CONFIG_YAML_V1) as { dns: unknown }).dns)).toBe(true);
    expect(isLegacyDefaultDnsConfig(DEFAULT_DNS_CONFIG)).toBe(false);
  });

  it("upgrades an untouched legacy DNS section and leaves customized DNS alone", () => {
    const legacy = generateClashConfig({ nodes: [node], userConfig: { dnsYaml: LEGACY_DEFAULT_BASE_CONFIG_YAML_V1 } });
    expect(legacy.dns).toEqual(DEFAULT_DNS_CONFIG);

    const custom = { ...LEGACY_DEFAULT_DNS_CONFIG_V1, nameserver: ["223.5.5.5"] };
    expect(isLegacyDefaultDnsConfig(custom)).toBe(false);
    const customized = generateClashConfig({
      nodes: [node],
      userConfig: { dnsYaml: LEGACY_DEFAULT_BASE_CONFIG_YAML_V1.replace(/^  nameserver: .*$/m, "  nameserver: [223.5.5.5]") },
    });
    expect(customized.dns?.nameserver).toEqual(["223.5.5.5"]);
    expect(customized.dns?.fallback).toEqual(LEGACY_DEFAULT_DNS_CONFIG_V1.fallback);
  });

  it("migrates untouched legacy editor text and keeps the port lines", () => {
    const legacy = LEGACY_DEFAULT_BASE_CONFIG_YAML_V1.replace(/^mixed-port: .*$/m, "mixed-port: 7899").replace(
      /^allow-lan: .*$/m,
      "allow-lan: false"
    );
    const migrated = migrateLegacyDefaultBaseConfigYaml(legacy);
    expect(migrated).toContain("mixed-port: 7899");
    expect(migrated).toContain("allow-lan: false");
    expect(migrated).toContain("respect-rules: true");

    const edited = `${LEGACY_DEFAULT_BASE_CONFIG_YAML_V1}\nipv6: true`;
    expect(migrateLegacyDefaultBaseConfigYaml(edited)).toBe(edited);
  });
});

describe("rule provider download URL", () => {
  it("defaults to the jsDelivr mirror and migrates the old GitHub default", () => {
    expect(DEFAULT_RULE_PROVIDER_BASE_URL).toBe("https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo");
    expect(migrateLegacyRuleProviderBaseUrl(`${LEGACY_RULE_BASE_URL}/`)).toBe(DEFAULT_RULE_PROVIDER_BASE_URL);
    expect(migrateLegacyRuleProviderBaseUrl("https://rules.example.com")).toBe("https://rules.example.com");
    expect(migrateLegacyRuleProviderBaseUrl(undefined)).toBeUndefined();
  });

  it("generates providers from the mirror for configs saved with the old default", () => {
    const config = generateClashConfig({
      nodes: [node],
      userConfig: { dnsYaml: "", enabledGroups: MODULES, ruleProviderBaseUrl: LEGACY_RULE_BASE_URL },
    });
    const providers = config["rule-providers"] as Record<string, { url: string }>;
    expect(providers["cn-ip"].url).toBe(`${DEFAULT_RULE_PROVIDER_BASE_URL}/geoip/cn.mrs`);
    expect(providers["apple@cn"].url).toBe(`${DEFAULT_RULE_PROVIDER_BASE_URL}/geosite/apple@cn.mrs`);
  });
});
