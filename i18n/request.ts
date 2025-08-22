import { getRequestConfig } from 'next-intl/server';

let messages: any;

const loadMessages = async (locale: string) => {
  if (!messages) {
    messages = (await import(`../messages/${locale}.json`)).default;
  }
  return messages;
};

export default getRequestConfig(async () => {
  // Provide a static locale, fetch a user setting,
  // read from `cookies()`, `headers()`, etc.
  const locale = 'pt-PT';

  return {
    locale,
    messages: await loadMessages(locale),
  };
});