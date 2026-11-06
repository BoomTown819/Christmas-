import type { DescribeResponse } from './types';
import { aiConfigured, describeWithAI } from './ai';
import { extractFacts, firstSentence } from './extract';
import { FetchBlockedError, InvalidUrlError, fetchPage, parseProductUrl } from './safeFetch';

export async function describeProduct(rawUrl: string, itemName: string): Promise<DescribeResponse> {
  let url: URL;
  try {
    url = parseProductUrl(rawUrl);
  } catch (e) {
    if (e instanceof InvalidUrlError) return { status: 'invalid_url', message: e.message };
    throw e;
  }

  let html: string;
  let finalUrl: URL;
  try {
    ({ html, finalUrl } = await fetchPage(url));
  } catch (e) {
    if (e instanceof FetchBlockedError) {
      return { status: 'blocked', message: `${e.message} You can write the description yourself.` };
    }
    throw e;
  }

  const facts = extractFacts(html, finalUrl);
  const extras = {
    title: facts.productName ?? facts.title,
    imageUrl: facts.imageUrl,
    detectedPriceCents: facts.priceCents,
  };
  const hasProductText = Boolean(facts.productDescription || facts.metaDescription || facts.bodyText.length > 200);

  if (!hasProductText) {
    return {
      status: 'no_content',
      message: "The page loaded, but it didn't include readable product details (it may need JavaScript or a sign-in). Write the description yourself.",
      ...extras,
    };
  }

  if (aiConfigured()) {
    try {
      const sentence = await describeWithAI(facts, itemName);
      if (sentence) return { status: 'ok', source: 'ai', description: sentence, ...extras };
      return {
        status: 'no_content',
        message: "The AI read the page but couldn't find enough product information to describe it accurately. Write the description yourself.",
        ...extras,
      };
    } catch (err) {
      console.error('[describe] AI error:', (err as Error).message);
      // fall through to the page's own summary
    }
  }

  const own = facts.productDescription ?? facts.metaDescription;
  if (own) return { status: 'ok', source: 'page', description: firstSentence(own), ...extras };
  return {
    status: 'no_content',
    message: aiConfigured()
      ? "The AI service didn't respond and the page has no summary text. Write the description yourself."
      : 'AI descriptions are off (no API key on the server) and this page has no summary text. Write the description yourself.',
    ...extras,
  };
}
