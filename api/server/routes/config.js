const express = require('express');
const { defaultSocialLogins } = require('librechat-data-provider');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();
const emailLoginEnabled =
  process.env.ALLOW_EMAIL_LOGIN === undefined || isEnabled(process.env.ALLOW_EMAIL_LOGIN);
const passwordResetEnabled = isEnabled(process.env.ALLOW_PASSWORD_RESET);

router.get('/', async function (req, res) {
  const isBirthday = () => {
    const today = new Date();
    return today.getMonth() === 1 && today.getDate() === 11;
  };

  const ldapLoginEnabled =
    !!process.env.LDAP_URL && !!process.env.LDAP_BIND_DN && !!process.env.LDAP_USER_SEARCH_BASE;
  try {
    /** @type {TStartupConfig} */
    const payload = {
      appTitle: process.env.APP_TITLE || 'LibreChat',
      socialLogins: req.app.locals.socialLogins ?? defaultSocialLogins,
      discordLoginEnabled: !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET,
      facebookLoginEnabled:
        !!process.env.FACEBOOK_CLIENT_ID && !!process.env.FACEBOOK_CLIENT_SECRET,
      githubLoginEnabled: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
      googleLoginEnabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      openidLoginEnabled:
        !!process.env.OPENID_CLIENT_ID &&
        !!process.env.OPENID_CLIENT_SECRET &&
        !!process.env.OPENID_ISSUER &&
        !!process.env.OPENID_SESSION_SECRET,
      openidLabel: process.env.OPENID_BUTTON_LABEL || 'Continue with OpenID',
      openidImageUrl: process.env.OPENID_IMAGE_URL,
      ldapLoginEnabled,
      serverDomain: process.env.DOMAIN_SERVER || 'http://localhost:3080',
      emailLoginEnabled,
      registrationEnabled: !ldapLoginEnabled && isEnabled(process.env.ALLOW_REGISTRATION),
      socialLoginEnabled: isEnabled(process.env.ALLOW_SOCIAL_LOGIN),
      emailEnabled:
        (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
        !!process.env.EMAIL_USERNAME &&
        !!process.env.EMAIL_PASSWORD &&
        !!process.env.EMAIL_FROM,
      passwordResetEnabled,
      checkBalance: isEnabled(process.env.CHECK_BALANCE),
      showBirthdayIcon:
        isBirthday() ||
        isEnabled(process.env.SHOW_BIRTHDAY_ICON) ||
        process.env.SHOW_BIRTHDAY_ICON === '',
      helpAndFaqURL: process.env.HELP_AND_FAQ_URL || 'https://librechat.ai',
      interface: req.app.locals.interfaceConfig,
      analyticsGtmId: process.env.ANALYTICS_GTM_ID,
      modelSpecs: req.app.locals.modelSpecs,
      showToxicity: process.env.SHOW_TOXICITY !== 'false',
      showInjection: process.env.SHOW_INJECTION !== 'false',
      showFactuality: process.env.SHOW_FACTUALITY !== 'false',
      showFactualityContext: process.env.SHOW_FACTUALITY_CONTEXT !== 'false',
      showPII: process.env.SHOW_PII !== 'false',
    };

    if (typeof process.env.CUSTOM_FOOTER === 'string') {
      payload.customFooter = process.env.CUSTOM_FOOTER;
    }

    return res.status(200).send(payload);
  } catch (err) {
    logger.error('Error in startup config', err);
    return res.status(500).send({ error: err.message });
  }
});

module.exports = router;
