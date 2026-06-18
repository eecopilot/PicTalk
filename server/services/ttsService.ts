export function buildTtsUrl(text: string) {
  const url = new URL('https://tts.323686.xyz/tts');
  url.searchParams.set('t', text);
  url.searchParams.set('v', 'zh-CN-XiaoxiaoMultilingualNeural');
  url.searchParams.set('r', '-20');
  url.searchParams.set('p', '0');
  url.searchParams.set('o', 'audio-24khz-48kbitrate-mono-mp3');
  return url;
}

export function normalizeGoogleVariant(value: string | undefined) {
  return value === '2' ? 2 : 1;
}

export function buildGooglePronunciationUrl(text: string, variant: 1 | 2 = 1) {
  const word = googlePronunciationWord(text);
  const firstTwoLetters = word.slice(0, 2);
  return new URL(`https://ssl.gstatic.com/dictionary/static/pronunciation/2024-04-19/audio/${firstTwoLetters}/${word}_en_us_${variant}.mp3`);
}

function googlePronunciationWord(text: string) {
  const normalized = text
    .toLowerCase()
    .trim()
    .match(/[a-z]+(?:['-][a-z]+)*/)?.[0]
    ?.replace(/[^a-z]/g, '');
  return normalized || 'word';
}
