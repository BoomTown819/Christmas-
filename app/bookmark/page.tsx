import { PageHead } from '@/components/site/Village';
import { BookmarkButton } from './BookmarkButton';

export const metadata = { title: 'Add to Our Christmas button · Our Christmas' };

export default function BookmarkPage() {
  return (
    <>
      <PageHead deco={false}>
        <p className="pagehead-eyebrow">Shopping shortcut</p>
        <h1 className="pagehead-title">🎁 Add to Our Christmas button</h1>
        <p className="pagehead-sub">Keep this button in your bookmarks. On any product page, like Amazon or Louis Vuitton, tap it and the item lands on your wishlist with its picture, price and description filled in.</p>
      </PageHead>
      <main className="main bm-page">
        <BookmarkButton />
      </main>
    </>
  );
}
