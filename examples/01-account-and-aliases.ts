import { boolEnv, csvEnv, env, loginFromEnv, printJson, skip } from "./_shared.js";

const client = await loginFromEnv();

// Account methods covered here:
// - client.account.userData(): profile/user data from MobSI.
// - client.account.quota(): mailbox quota and folder sizes.
// - client.account.settings(): account settings returned by mail.com.
// - client.account.aliases(): active sender/mail-collect aliases.
// - client.account.validateRecipients(addresses): validates one address or an array before sending.
// - client.account.updateAliasDisplayName(address, displayName): changes the display name for an existing alias.
//
// Params:
// - validateRecipients: string or string[] of recipient email addresses.
// - updateAliasDisplayName: alias address plus the new sender display name.

const [userData, quota, settings, aliases] = await Promise.all([
  client.account.userData(),
  client.account.quota(),
  client.account.settings(),
  client.account.aliases(),
]);

printJson("account.userData", userData);
printJson("account.quota", quota);
printJson("account.settings", settings);
printJson("account.aliases", aliases);

const recipients = csvEnv("MAILCOM_VALIDATE_RECIPIENTS");
if (recipients.length > 0) {
  printJson("account.validateRecipients", await client.account.validateRecipients(recipients));
}

if (boolEnv("MAILCOM_UPDATE_ALIAS_DISPLAY_NAME")) {
  const address = env("MAILCOM_ALIAS_ADDRESS") ?? skip("MAILCOM_ALIAS_ADDRESS is required.", ["MAILCOM_ALIAS_ADDRESS"]);
  const displayName =
    env("MAILCOM_ALIAS_DISPLAY_NAME") ?? skip("MAILCOM_ALIAS_DISPLAY_NAME is required.", ["MAILCOM_ALIAS_DISPLAY_NAME"]);

  await client.account.updateAliasDisplayName(address, displayName);
  printJson("account.updateAliasDisplayName", { address, displayName, updated: true });
}
