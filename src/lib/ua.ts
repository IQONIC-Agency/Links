export type Device = "ios" | "android" | "desktop" | "other";
export type InAppName = "instagram" | "threads" | "facebook" | "tiktok" | null;

export type UaInfo = {
  device: Device;
  inApp: boolean;
  inAppName: InAppName;
  isBot: boolean;
};

/**
 * Link-preview crawlers and generic bots. Instagram/Threads in-app browsers do
 * not match this; Meta's preview fetcher does (facebookexternalhit/Facebot/meta-externalagent).
 */
const BOT_RE =
  /bot\b|bot\/|crawler|spider|slurp|preview|facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|embedly|quora link|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegram|skypeuripreview|discord|slack|linkedin|redditbot|applebot|googlebot|bingbot|yandex|baidu|duckduck|petalbot|semrush|ahrefs|mj12|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|curl\/|wget\/|python-requests|python-urllib|aiohttp|go-http-client|okhttp|java\/|libwww|httpclient|node-fetch|axios\//i;

export function parseUa(ua: string | null | undefined): UaInfo {
  const s = ua ?? "";
  // Meta's in-app browsers contain "Instagram"/"Barcelona"/"FBAV" but never "facebookexternalhit"
  const isBot = s.length < 10 || BOT_RE.test(s);

  let device: Device = "other";
  if (/iPhone|iPad|iPod/i.test(s)) device = "ios";
  else if (/Android/i.test(s)) device = "android";
  else if (/Windows|Macintosh|X11|Linux|CrOS/i.test(s)) device = "desktop";

  let inAppName: InAppName = null;
  if (/Barcelona/i.test(s)) inAppName = "threads";
  else if (/Instagram/i.test(s)) inAppName = "instagram";
  else if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/.test(s)) inAppName = "facebook";
  else if (/musical_ly|BytedanceWebview|TikTok/i.test(s)) inAppName = "tiktok";

  return { device, inApp: inAppName !== null, inAppName, isBot };
}
