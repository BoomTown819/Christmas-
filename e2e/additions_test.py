"""Browser test for the add-ons: secret gift ideas, store shortcuts, paste link, kept drafts, share-to-app."""
import json, os, re, time
from playwright.sync_api import sync_playwright, expect
BASE = os.environ.get("BASE", "http://localhost:3000"); FX = "http://127.0.0.1:9911"
R = str(int(time.time()))[-5:]
SHOTS = os.environ.get("SHOTS", "/tmp")

def shot(pg, name): pg.screenshot(path=f"{SHOTS}/{name}.png", full_page=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    def person(name, pin, w=1280, h=900):
        ctx = b.new_context(viewport={"width": w, "height": h}, permissions=["clipboard-read", "clipboard-write"])
        pg = ctx.new_page()
        pg.goto(BASE + "/signup"); pg.fill("#su-name", name); pg.fill("#su-pin", pin)
        pg.get_by_role("button", name="Start my wishlist").click(); pg.wait_for_url("**/character**")
        return pg

    # ---------- family: Mom (list owner), Sonny and Dad (gift buyers) ----------
    mom = person("MomA" + R, "1225")
    mom_bodies = []
    def record(r):
        if "rest/v1" in r.url or "/list/" in r.url:
            try: mom_bodies.append(r.text())
            except Exception: pass   # redirects have no body
    mom.on("response", record)
    mom.goto(BASE + "/my-list")
    mom.get_by_role("button", name="Add item").first.click()
    mom.fill("#f-name", "Candle"); mom.fill("#f-url", "https://example.com/candle"); mom.fill("#f-price", "18")
    mom.get_by_role("button", name="Add to wishlist").click(); expect(mom.locator(".modal")).to_have_count(0)
    mom_slug = mom.get_by_role("link", name="See what family sees").first.get_attribute("href")
    mom.goto(BASE + "/"); mom.get_by_role("button", name="Create a family").click()
    mom.fill("#family-name", "Crew " + R); mom.get_by_role("button", name="Create family").click()
    mom.get_by_role("button", name="Invite family").first.click()
    invite = mom.locator("#invite-link").input_value(); mom.keyboard.press("Escape")
    sonny = person("SonA" + R, "2580", 390, 844)
    dad = person("DadA" + R, "4466")
    stranger = person("StrA" + R, "1357")
    for pg in (sonny, dad):
        pg.goto(invite); pg.get_by_role("button", name=re.compile("^Join")).click(); pg.wait_for_timeout(1200)

    # ---------- secret gift ideas ----------
    sonny.goto(BASE + mom_slug)
    ideas = sonny.get_by_test_id("secret-ideas")
    expect(ideas).to_be_visible(timeout=10000)
    expect(ideas).to_contain_text(f"MomA{R} can’t see")
    sonny.get_by_role("button", name="＋ Add a secret idea").click()
    sonny.fill("#idea-url", FX + "/product")
    expect(sonny.locator("#idea-title")).to_have_value("Aurora ANC Headphones", timeout=15000)
    expect(sonny.locator("#idea-price")).to_have_value("279.00")
    sonny.fill("#idea-note", "She said hers are broken")
    sonny.get_by_role("button", name="Add secret idea").click()
    expect(ideas.get_by_test_id("idea")).to_have_count(1)
    expect(ideas.get_by_test_id("idea")).to_contain_text("Idea from you")
    shot(sonny, "add-ideas-sonny")

    dad.goto(BASE + mom_slug)
    idea = dad.get_by_test_id("idea").first
    expect(idea).to_contain_text(f"Idea from SonA{R}", timeout=10000)
    expect(idea).to_contain_text("She said hers are broken")
    idea.get_by_role("button", name="I’ll get this! 🎁").click()
    expect(idea).to_contain_text("You’re getting this")
    idea.get_by_role("button", name="Mark as bought").click()
    expect(idea).to_contain_text("You bought this ✓")
    assert idea.get_by_role("button", name=re.compile("Delete idea")).count() == 0   # only the author can delete
    sonny.reload(); expect(sonny.get_by_test_id("idea").first).to_contain_text(f"Bought by DadA{R}", timeout=10000)

    # The owner never sees ideas: not on her list, not in any data her browser receives.
    mom.goto(BASE + mom_slug); mom.wait_for_timeout(2500)
    expect(mom.get_by_test_id("secret-ideas")).to_have_count(0)
    mom.goto(BASE + "/my-list"); mom.wait_for_timeout(1500)
    for body in mom_bodies:
        assert "Aurora ANC Headphones" not in body and "hers are broken" not in body, "idea leaked to the list owner"
    # Strangers with the link don't see them either; nor do signed-out guests.
    stranger.goto(BASE + mom_slug); stranger.wait_for_timeout(2000)
    expect(stranger.get_by_test_id("secret-ideas")).to_have_count(0)
    g = b.new_context().new_page(); g.goto(BASE + mom_slug); g.wait_for_timeout(1500)
    expect(g.get_by_test_id("secret-ideas")).to_have_count(0); g.context.close()
    print("secret ideas ok")

    # ---------- store shortcuts + cart links ----------
    sonny.goto(BASE + "/my-list")
    sonny.get_by_role("button", name="Add item").first.click()
    shop = sonny.get_by_test_id("shop-shortcuts")
    expect(shop).to_be_visible()
    expect(shop.get_by_role("link", name="Open Amazon")).to_have_attribute("href", "https://www.amazon.com/")
    sonny.fill("#f-name", "lego castle")
    expect(shop.get_by_role("link", name="Search Amazon for lego castle")).to_have_attribute("href", "https://www.amazon.com/s?k=lego%20castle")
    expect(shop.get_by_role("link", name="Search Target for lego castle")).to_have_attribute("href", re.compile(r"target\.com/s\?searchTerm=lego%20castle"))
    shop.get_by_role("radio", name="🛒 Go to my cart").click()
    expect(shop.get_by_role("link", name="Open my Amazon cart")).to_have_attribute("href", "https://www.amazon.com/gp/cart/view.html")
    expect(shop.get_by_role("link", name="Open my Walmart cart")).to_have_attribute("href", "https://www.walmart.com/cart")
    for a in shop.get_by_role("link").all(): assert a.get_attribute("target") == "_blank"
    shot(sonny, "add-shop-shortcuts")

    # Leave for the "store", copy a link there, come back and tap Paste link. The form kept what was typed.
    sonny.fill("#f-price", "")
    sonny.evaluate(f"navigator.clipboard.writeText('Look at this! {FX}/product great reviews')")
    with sonny.context.expect_page() as store_tab:
        sonny.route("https://www.amazon.com/**", lambda r: r.fulfill(body="<title>store</title>", content_type="text/html"))
        shop.get_by_role("link", name="Open my Amazon cart").click()
    store_tab.value.close()
    expect(sonny.locator("#f-name")).to_have_value("lego castle")
    sonny.get_by_role("button", name="📋 Paste link").click()
    expect(sonny.locator("#f-url")).to_have_value(FX + "/product")
    expect(sonny.locator("#f-price")).to_have_value("279.00", timeout=15000)
    expect(sonny.locator("#f-name")).to_have_value("lego castle")          # what you typed is never replaced
    expect(sonny.get_by_test_id("shop-shortcuts")).to_have_count(0)        # shortcuts step aside once there's a link
    sonny.get_by_role("button", name="Cancel").click(); expect(sonny.locator(".modal")).to_have_count(0)
    print("store shortcuts + paste ok")

    # ---------- the phone throws the page away while you're in the store app: nothing is lost ----------
    sonny.get_by_role("button", name="Add item").first.click()
    sonny.fill("#f-name", "Fuzzy socks"); sonny.fill("#f-price", "12"); sonny.fill("#f-reason", "Cold toes")
    sonny.reload()
    expect(sonny.locator(".modal")).to_have_count(1, timeout=10000)
    expect(sonny.get_by_text("We kept what you started", exact=False)).to_be_visible()
    expect(sonny.locator("#f-name")).to_have_value("Fuzzy socks")
    expect(sonny.locator("#f-price")).to_have_value(re.compile(r"^12(\.00)?$"))
    expect(sonny.locator("#f-reason")).to_have_value("Cold toes")
    sonny.fill("#f-url", "https://example.com/socks")
    sonny.get_by_role("button", name="Add to wishlist").click(); expect(sonny.locator(".modal")).to_have_count(0)
    expect(sonny.locator(".card", has_text="Fuzzy socks")).to_have_count(1)
    sonny.reload(); sonny.wait_for_timeout(1200); expect(sonny.locator(".modal")).to_have_count(0)   # draft cleared after saving
    # Cancelling also forgets it
    sonny.get_by_role("button", name="Add item").first.click(); sonny.fill("#f-name", "Never mind")
    sonny.get_by_role("button", name="Cancel").click(); sonny.reload(); sonny.wait_for_timeout(1200)
    expect(sonny.locator(".modal")).to_have_count(0)
    print("kept drafts ok")

    # ---------- Share → Our Christmas (from a store app) ----------
    sonny.goto(BASE + "/add?title=Aurora&text=" + "Check%20this%20out%20" + FX.replace(":", "%3A") + "%2Fproduct")
    expect(sonny).to_have_url(re.compile(r"/my-list$"), timeout=10000)
    expect(sonny.locator("#f-url")).to_have_value(FX + "/product")
    expect(sonny.locator("#f-name")).to_have_value("Aurora ANC Headphones", timeout=15000)
    sonny.get_by_role("button", name="Cancel").click()
    # signed out: log in first, then land in Add item with the link
    out = b.new_context().new_page()
    out.goto(BASE + "/add?url=" + FX.replace(":", "%3A") + "%2Fproduct")
    expect(out).to_have_url(re.compile(r"/login\?next="))
    out.fill("#li-name", "SonA" + R); out.fill("#li-pin", "2580"); out.get_by_role("button", name="Log in", exact=True).click()
    expect(out.locator("#f-url")).to_have_value(FX + "/product", timeout=15000)
    out.context.close()
    m = json.loads(sonny.request.get(BASE + "/manifest.webmanifest").text())
    assert m["share_target"]["action"] == "/add" and m["display"] == "standalone", m
    assert sonny.request.get(BASE + "/icons/icon-512.png").status == 200
    print("share to app ok")
    b.close()
print("ALL ADDITION CHECKS PASSED")
