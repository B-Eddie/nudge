import type { AppCategoryEntry } from "./settings";

export function isHelperApp(bundleId: string, entry: AppCategoryEntry): boolean {
  // Native activation policy is authoritative for discovered apps. Older saved
  // entries have no metadata, so use conservative helper/service identifiers.
  if (entry.is_helper != null) return entry.is_helper;
  return /(?:^|[.\s_-])(?:helper|agent|daemon|xpc|service|services)(?:$|[.\s_(-])/i.test(`${bundleId} ${entry.name}`)
    || /(?:helper|agent|daemon|xpc|service|extension|widget)/i.test(`${bundleId} ${entry.name}`)
    || /(?:renderer|gpu process|web content|crashpad|loginitem|(?:callservices|photoLibrary|chrono)d)/i.test(entry.name);
}
