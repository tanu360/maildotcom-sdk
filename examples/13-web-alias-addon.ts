import { MailComWebAliasAddon, type DefaultAliasSender } from "../src/web-aliases.js";
import { boolEnv, env, printJson, skip } from "./_shared.js";

// Demonstrates the separate webmail alias addon:
// - createAlias(address)
// - deleteAlias(address)
// - setDefaultAlias(address, { sender: "email" | "name-email" })
// - defaultSenderOptions(address)

const email = env("MAILCOM_EMAIL");
const password = env("MAILCOM_PASSWORD");
if (!email || !password) skip("MAILCOM_EMAIL and MAILCOM_PASSWORD are required.", ["MAILCOM_EMAIL", "MAILCOM_PASSWORD"]);

if (!boolEnv("MAILCOM_ALIAS_CONFIRM_MUTATION")) {
  skip("Set MAILCOM_ALIAS_CONFIRM_MUTATION=true before running web alias mutations.", [
    "MAILCOM_ALIAS_CONFIRM_MUTATION",
  ]);
}

const addon = new MailComWebAliasAddon({ email, password });
await addon.login();

const createAddress = env("MAILCOM_ALIAS_CREATE");
if (createAddress) {
  printJson("webAliases.createAlias", await addon.createAlias(createAddress));
}

const defaultAddress = env("MAILCOM_ALIAS_DEFAULT");
if (defaultAddress) {
  const sender = env("MAILCOM_ALIAS_DEFAULT_SENDER", "email") as DefaultAliasSender;
  await addon.setDefaultAlias(defaultAddress, { sender });
  printJson("webAliases.setDefaultAlias", { address: defaultAddress, sender, updated: true });
  printJson("webAliases.defaultSenderOptions", await addon.defaultSenderOptions(defaultAddress));
}

const deleteAddress = env("MAILCOM_ALIAS_DELETE");
if (deleteAddress) {
  await addon.deleteAlias(deleteAddress);
  printJson("webAliases.deleteAlias", { address: deleteAddress, deleted: true });
}
