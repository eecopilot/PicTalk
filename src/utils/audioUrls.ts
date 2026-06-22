import type { TextRegion } from '../types';

export function ttsUrl(text: string) {
  const url = new URL('/api/tts', window.location.origin);
  url.searchParams.set('t', text);
  return url.toString();
}

export function directTtsUrl(text: string) {
  const url = new URL('https://tts.323686.xyz/tts');
  url.searchParams.set('t', text);
  url.searchParams.set('v', 'zh-CN-XiaoxiaoMultilingualNeural');
  url.searchParams.set('r', '-20');
  url.searchParams.set('p', '0');
  url.searchParams.set('o', 'audio-24khz-48kbitrate-mono-mp3');
  return url.toString();
}

function googlePronunciationWord(text: string) {
  return text
    .toLowerCase()
    .trim()
    .match(/[a-z]+(?:['-][a-z]+)*/)?.[0]
    ?.replace(/[^a-z]/g, '') ?? '';
}

function googlePronunciationUrl(text: string, variant: 1 | 2 = 1) {
  const word = googlePronunciationWord(text);
  if (!word) return null;
  const firstTwoLetters = word.slice(0, 2);
  return `https://ssl.gstatic.com/dictionary/static/pronunciation/2024-04-19/audio/${firstTwoLetters}/${word}_en_us_${variant}.mp3`;
}

export function regionAudioUrl(region: TextRegion, googleVariant: 1 | 2) {
  return region.audioSource === 'google'
    ? googlePronunciationUrl(region.text, googleVariant)
    : ttsUrl(region.text);
}
