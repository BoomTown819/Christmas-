"""Multi-user end-to-end test: several accounts and a guest in separate browsers.

Needs: the local Supabase stack (stack/start.sh), e2e/fixtures-server.mjs, and the app running with
ALLOW_PRIVATE_HOSTS=1 METADATA_SERVICE_URL=http://127.0.0.1:9911/microlink ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:9911 on BASE.
"""
import glob, json, os, quopri, re, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:3000")
FX = "http://127.0.0.1:9911"
MAIL_DIR = os.environ.get("MAIL_DIR", "/home/claude/stack/mail")
SHOTS = os.environ.get("SHOTS", "")
RUN = str(int(time.time()))[-6:]
PW = "jingle-bells-42"
SECRET_NAMES = ["Grandma Jo", "Papa Bear"]  # claimer names that must never reach the owner
PRIVATE_NOTE = "Size medium, the blue one"

def email(who): return f"{who.lower()}-{RUN}@test.local"
PINS = {"Sonny": "2580", "Mom": "1225", "Dad": "4466"}
# Sign-in names with a PIN are unique, so clear earlier test runs' PIN names first (local test database only).
subprocess.run(["psql", "-h", "/tmp", "-p", "54322", "-U", "postgres", "-qc",
                "delete from public.account_pins where name_key in ('sonny','mom','dad','uncle')"], check=True)

def shot(page, name, full=False):
    if SHOTS: page.screenshot(path=f"{SHOTS}/{name}.png", full_page=full)

def signup(page, name, avatar_idx=0, next_path=None):
    """Name + PIN sign-up: no email, no password."""
    page.goto(f"{BASE}/signup" + (f"?next={next_path}" if next_path else ""))
    assert page.locator("#su-email").count() == 0 and page.locator("#su-pass").count() == 0
    page.fill("#su-name", name)
    page.fill("#su-pin", PINS[name])
    page.locator(".avatar-opt").nth(avatar_idx).click()
    page.get_by_role("button", name="Start my wishlist").click()
    if not next_path:
        expect(page).to_have_url(re.compile("/character\\?new=1"))
        expect(page.get_by_role("button", name="Generate my Christmas character 🎅")).to_be_visible()

PHOTO = os.path.join(os.path.dirname(__file__), "fixtures", "still.png")

def make_character(page, activity_label=None):
    """Upload a photo and generate the 8-bit character (OpenAI is a local stand-in in tests)."""
    if "/character" not in page.url: page.goto(f"{BASE}/character")
    page.set_input_files("#ch-photo", PHOTO)
    expect(page.get_by_role("heading", name="Fit your face in the frame")).to_be_visible()
    page.get_by_label("Zoom").fill("1.6")
    page.get_by_role("button", name="Use this face").click()
    expect(page.get_by_role("img", name="Selected photo")).to_be_visible()
    if activity_label: page.get_by_role("radio", name=activity_label).click()
    page.get_by_role("button", name="Generate my Christmas character 🎅").click()
    expect(page.locator(".creator-stage [data-testid=character]")).to_have_attribute("data-anim", "ai", timeout=30000)
    expect(page.get_by_text("✨ AI animation")).to_be_visible()

def assert_decor_harmless(page, label):
    """Decorative characters must never cover or intercept anything you can click or read."""
    page.wait_for_timeout(600)
    bad = page.evaluate("""() => {
      const decor = [...document.querySelectorAll('.char-decor, .decor-zone, .footer-parade, .parade-walker')];
      const problems = [];
      for (const d of decor) if (getComputedStyle(d).pointerEvents !== 'none') problems.push('clickable decor: ' + d.className);
      const targets = [...document.querySelectorAll('button, a, input, textarea, select, h1, h2, h3, p, [data-testid=item-card]')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !el.closest('.char-decor, .decor-zone, .footer-parade'); });
      for (const el of targets) {
        const r = el.getBoundingClientRect();
        const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]];
        for (const [x, y] of pts) {
          if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && hit.closest('.char-decor, .decor-zone, .footer-parade')) problems.push('decor covers: ' + (el.textContent || el.tagName).trim().slice(0, 40));
        }
      }
      return problems;
    }""")
    assert not bad, f"{label}: {bad}"

def save_account(page, who, password=PW):
    page.goto(f"{BASE}/profile")
    page.fill("#sa-email", email(who)); page.fill("#sa-pass", password)
    page.get_by_role("button", name="Save my account").click()
    try:
        expect(page.get_by_text("Saved. You can now log in with this email on any device.")).to_be_visible()
    except AssertionError:
        print("SAVE-ACCOUNT PAGE SAID:", page.locator("[data-testid=save-account]").inner_text()[:400]); raise
    page.reload()
    expect(page.get_by_test_id("save-account")).to_have_count(0)   # no longer a name-only account

def add_item(page, name, url, price, star=None, half=False, reason="", note=""):
    page.get_by_role("button", name="Add item").first.click()
    page.fill("#f-name", name)
    page.fill("#f-url", url)
    page.fill("#f-price", price)
    if star is not None: click_star(page, "#f-rating", star, half)
    if reason: page.fill("#f-reason", reason)
    if note: page.fill("#f-note", note)
    page.get_by_role("button", name="Add to wishlist").click()
    expect(page.locator(".modal")).to_have_count(0)
    expect(card(page, name)).to_have_count(1)   # saved to the database

def click_star(page, sel, i, left):
    box = page.locator(f"{sel} .star").nth(i).bounding_box()
    page.mouse.click(box["x"] + box["width"] * (0.25 if left else 0.8), box["y"] + box["height"] / 2)

def total(page): return int(page.get_by_test_id("total").get_attribute("data-cents"))

def card(page, name): return page.locator("[data-testid=item-card]", has_text=name)

def capture(page):
    """Record every response body the page receives, to prove nothing secret is sent."""
    bodies = []
    def on_resp(r):
        try:
            ct = r.headers.get("content-type", "")
            if any(t in ct for t in ("json", "html", "text/x-component", "text/plain")):
                bodies.append((r.url, r.text()))
        except Exception:
            pass
    page.on("response", on_resp)
    return bodies

def assert_no_secrets(bodies, label):
    for url, body in bodies:
        for s in SECRET_NAMES:
            assert s not in body, f"{label}: '{s}' leaked in {url}"
        assert '"claimer_name"' not in body and "claimed_at" not in body, f"{label}: claim fields in {url}"

with sync_playwright() as p:
    # a fake webcam, so the in-page camera can be tested
    browser = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    errors = []
    def ctx(**kw):
        c = browser.new_context(viewport={"width": 1280, "height": 900}, **kw)
        c.on("page", lambda pg: pg.on("pageerror", lambda e: errors.append(str(e))))
        return c

    sonny_ctx, mom_ctx, dad_ctx, grandma_ctx = ctx(), ctx(), ctx(), ctx()
    sonny, mom, dad, grandma = sonny_ctx.new_page(), mom_ctx.new_page(), dad_ctx.new_page(), grandma_ctx.new_page()
    sonny_bodies = capture(sonny)

    # ---------- 1. Sonny: account + wishlist ----------
    signup(sonny, "Sonny", 3)
    make_character(sonny, "Dancing")
    gif_src = sonny.locator(".creator-stage [data-testid=character] img").get_attribute("src")
    assert re.match(r"^/api/character/[A-Za-z0-9]{16}/gif$", gif_src), gif_src
    r = sonny_ctx.request.get(BASE + gif_src)
    assert r.status == 200 and r.headers["content-type"] == "image/gif", (r.status, r.headers)
    assert sonny_ctx.request.get(BASE + "/api/character/" + "z" * 16 + "/gif").status == 404
    # change activity without a new photo: the stand-in refuses sleigh GIFs, so the fallback must be labelled honestly
    sonny.get_by_role("radio", name="Riding a sleigh").click()
    expect(sonny.get_by_text("Preview · tap “Animate” to make it")).to_be_visible()
    sonny.get_by_role("button", name="Animate: Riding a sleigh").click()
    expect(sonny.locator(".anim-label", has_text="Animated in your browser")).to_be_visible(timeout=30000)
    expect(sonny.get_by_text(re.compile("The AI animation didn’t work"))).to_be_visible()
    expect(sonny.locator(".creator-stage [data-testid=character]")).to_have_attribute("data-anim", "css")
    sonny.get_by_role("radio", name="Dancing").click()
    sonny.get_by_role("button", name="Animate: Dancing").click()
    expect(sonny.get_by_text("✨ AI animation")).to_be_visible(timeout=30000)
    shot(sonny, "v3-creator")
    sonny.get_by_role("link", name="See it on the dashboard").click()
    expect(sonny.get_by_test_id("welcome")).to_have_text("Welcome back, Sonny! 🎅")
    expect(sonny.locator(".welcome-row [data-testid=character]")).to_have_attribute("data-anim", "ai")
    sonny.goto(BASE + "/my-list")
    expect(sonny.get_by_test_id("character-cta")).to_have_count(0)
    expect(sonny.get_by_role("heading", name="Sonny’s Christmas Wishlist")).to_be_visible()
    expect(sonny.get_by_text("Nothing under the tree yet")).to_be_visible()
    expect(sonny.get_by_test_id("device-note")).to_have_count(0)   # has a PIN, so the list isn't stuck on this device

    # AI description from the product page
    sonny.get_by_role("button", name="Add item").first.click()
    expect(sonny.locator("#f-url")).to_be_focused()           # the link comes first
    sonny.fill("#f-url", f"{FX}/product")                       # typing/pasting a link starts the lookup by itself
    expect(sonny.get_by_text("Finding your Christmas present… 🎁")).to_be_visible(timeout=5000)
    expect(sonny.locator("#f-desc")).to_have_value(re.compile("adaptive noise cancellation"), timeout=15000)
    expect(sonny.locator("#f-name")).to_have_value("Aurora ANC Headphones")
    expect(sonny.locator("#f-price")).to_have_value("279.00")    # price filled from the page
    expect(sonny.locator(".image-thumb img")).to_have_attribute("src", f"{FX}/img.svg")
    expect(sonny.get_by_text("Found it", exact=False)).to_be_visible()
    shot(sonny, "v3-autofill-found")
    sonny.fill("#f-name", "Aurora ANC Headphones")              # still editable
    click_star(sonny, "#f-rating", 4, False)
    sonny.fill("#f-reason", "Long flights home for the holidays.")
    sonny.fill("#f-note", PRIVATE_NOTE)
    sonny.get_by_role("button", name="Add to wishlist").click()
    expect(card(sonny, "Aurora ANC Headphones")).to_contain_text(PRIVATE_NOTE)
    expect(card(sonny, "Aurora ANC Headphones").locator(".ai-badge")).to_be_visible()

    # A page that needs JavaScript: filled by the browser-based preview service. No price is ever guessed.
    sonny.get_by_role("button", name="Add item").first.click()
    sonny.fill("#f-url", f"{FX}/jsonly")
    expect(sonny.locator("#f-name")).to_have_value("Frosty Snow Globe", timeout=15000)
    expect(sonny.locator(".image-thumb img")).to_have_attribute("src", "http://127.0.0.1:9911/globe.svg")
    expect(sonny.locator("#f-price")).to_have_value("")
    expect(sonny.get_by_text("Couldn’t find a price on that page. Add it here.")).to_be_visible()
    sonny.get_by_role("button", name="Cancel").click()
    expect(sonny.locator(".modal")).to_have_count(0)

    # A store that turns us away: friendly message, type it in, upload your own picture.
    sonny.get_by_role("button", name="Add item").first.click()
    sonny.fill("#f-url", f"{FX}/captcha")
    expect(sonny.get_by_text("No luck reading that page")).to_be_visible(timeout=15000)
    expect(sonny.locator("#f-name")).to_be_focused()
    shot(sonny, "v3-autofill-failed")
    sonny.fill("#f-name", "Snow Boots")
    sonny.fill("#f-price", "89")
    sonny.set_input_files("#f-image-file", "e2e/fixtures/still.png")
    expect(sonny.locator(".image-thumb img")).to_have_attribute("src", re.compile(r"^/api/item-image/[A-Za-z0-9_-]{24,}$"), timeout=15000)
    sonny.get_by_role("button", name="Add to wishlist").click()
    boots_img = card(sonny, "Snow Boots").locator(".card-media img")
    expect(boots_img).to_have_attribute("src", re.compile(r"^/api/item-image/"))
    assert sonny.evaluate("(el) => el.complete && el.naturalWidth > 0", boots_img.element_handle()), "uploaded picture didn't load"
    sonny.get_by_role("button", name="Delete Snow Boots").click()
    card(sonny, "Snow Boots").get_by_role("button", name="Delete").click()
    expect(card(sonny, "Snow Boots")).to_have_count(0)

    add_item(sonny, "Lego Titanic", "lego.com/titanic", "679.99", 3, True)        # 3.5
    add_item(sonny, "Wool Socks", "https://www.darntough.com/socks", "24", 1, False)  # 2
    add_item(sonny, "Board Game", "https://example.com/game", "45.50", 2, False)    # 3
    expect(sonny.get_by_test_id("total")).to_have_attribute("data-cents", str(27900 + 67999 + 2400 + 4550))

    # edit price, rate on card, delete with confirm + undo, reorder
    sonny.get_by_role("button", name="Edit Board Game").click()
    sonny.fill("#f-price", "50")
    sonny.get_by_role("button", name="Save changes").click()
    expect(sonny.get_by_test_id("total")).to_have_attribute("data-cents", str(27900 + 67999 + 2400 + 5000))
    sonny.get_by_role("button", name="Delete Board Game").click()
    card(sonny, "Board Game").get_by_role("button", name="Delete").click()
    expect(sonny.get_by_test_id("total")).to_have_attribute("data-cents", str(27900 + 67999 + 2400))
    sonny.get_by_role("button", name="Undo").click()
    expect(card(sonny, "Board Game")).to_have_count(1, timeout=8000)
    sonny.get_by_role("button", name="Move Wool Socks earlier").click()
    sonny.wait_for_timeout(500)
    names = sonny.locator(".grid .card-title").all_inner_texts()
    assert names.index("Wool Socks") < names.index("Lego Titanic"), names
    sonny.reload()
    names_after = sonny.locator(".grid .card-title").all_inner_texts()
    assert names_after == names, (names, names_after)   # order and items persisted in the database
    expect(sonny.get_by_test_id("total")).to_have_attribute("data-cents", str(27900 + 67999 + 2400 + 5000))
    shot(sonny, "v2-mylist", True)

    # share dialog
    sonny.get_by_role("button", name="Share my Christmas list 🎁").click()
    link = sonny.locator("#share-link").input_value()
    assert re.match(rf"{BASE}/list/[A-Za-z0-9]{{12}}$", link), link
    sheet = sonny.locator(".sharesheet").first
    from urllib.parse import unquote
    for label, prefix in [("WhatsApp", "https://wa.me/?text="), ("Messages", "sms:"), ("Email", "mailto:")]:
        href = sheet.get_by_role("link", name=re.compile(label)).get_attribute("href")
        assert href.startswith(prefix) and link in unquote(href), (label, href)
    shot(sonny, "v2-share")
    sonny.keyboard.press("Escape")

    # ---------- 2. Mom: family + invitation ----------
    signup(mom, "Mom", 1)
    mom.get_by_role("link", name="Skip for now").click()
    expect(mom).to_have_url(re.compile("/my-list"))
    expect(mom.get_by_test_id("character-cta")).to_be_visible()
    # taking a photo with the camera, right in the page
    mom.goto(BASE + "/character")
    mom.get_by_role("button", name="📷 Take a photo").click()
    expect(mom.get_by_label("Camera preview")).to_be_visible()
    expect(mom.get_by_role("button", name="📸 Snap")).to_be_enabled(timeout=10000)
    mom.get_by_role("button", name="📸 Snap").click()
    mom.get_by_role("button", name="Use this face").click()
    expect(mom.get_by_role("img", name="Selected photo")).to_be_visible()
    assert mom.evaluate("document.querySelector('img[alt=\"Selected photo\"]').src.startsWith('data:image/jpeg')")
    mom.goto(BASE + "/my-list")
    add_item(mom, "Cashmere Scarf", "https://example.com/scarf", "89", 3, False)
    mom.goto(BASE + "/")
    mom.get_by_role("button", name="Create a family").click()
    mom.fill("#family-name", "The Christmas Crew")
    mom.get_by_role("button", name="Create family").click()
    expect(mom.locator(".family-title")).to_contain_text("The Christmas Crew")
    mom.get_by_role("button", name="Invite family").first.click()
    code = mom.get_by_test_id("invite-code").inner_text().replace("-", "")
    invite_link = mom.locator("#invite-link").input_value()
    assert invite_link.endswith(f"/join/{code}")
    mom.keyboard.press("Escape")

    # Sonny joins with the link while signed in
    sonny.goto(invite_link)
    expect(sonny.get_by_role("heading", name="Join The Christmas Crew")).to_be_visible()
    sonny.get_by_role("button", name="Join The Christmas Crew").click()
    expect(sonny.locator(".family-title")).to_contain_text("The Christmas Crew")

    # Dad opens the invitation signed out, signs up, comes back and joins
    dad.goto(invite_link)
    expect(dad.get_by_text("Mom invited you.")).to_be_visible()
    dad.get_by_role("link", name="Join with just your name").click()
    dad.fill("#su-name", "Dad")
    dad.get_by_role("button", name="Start my wishlist").click()
    expect(dad.get_by_text("Choose a PIN.")).to_be_visible()     # a PIN is required
    dad.fill("#su-pin", PINS["Dad"])
    dad.get_by_role("button", name="Start my wishlist").click()
    expect(dad).to_have_url(re.compile(f"/join/{code}"))
    dad.get_by_role("button", name="Join The Christmas Crew").click()
    expect(dad.get_by_test_id("member-card")).to_have_count(3)
    dad.get_by_role("link", name="Make my character 🎅").click()
    make_character(dad, "Carrying presents")
    dad.goto(BASE + "/")

    # family dashboard updates for Mom
    mom.reload()
    expect(mom.get_by_test_id("member-card")).to_have_count(3)
    sonny_card = mom.get_by_test_id("member-card").filter(has_text="Sonny")
    expect(sonny_card).to_contain_text("4 items")
    expect(sonny_card).to_contain_text("4 still available")
    shot(mom, "v2-dashboard", True)

    # ---------- 3. Guest (no account) claims via the shared link ----------
    grandma.goto(link)
    expect(grandma.get_by_role("heading", name="Sonny’s Christmas Wishlist")).to_be_visible()
    html = grandma.content()
    assert PRIVATE_NOTE not in html, "private note leaked to guest"
    expect(card(grandma, "Aurora ANC Headphones")).to_contain_text("Long flights home")  # "why" is public
    card(grandma, "Aurora ANC Headphones").get_by_role("button", name="I’m getting this! 🎁").click()
    grandma.fill("#claim-name", "Grandma Jo")
    grandma.fill("#claim-email", "jo@example.com")
    grandma.get_by_role("button", name="Claim this gift").click()
    expect(grandma.get_by_text("Tick the box to confirm.")).to_be_visible()
    grandma.check("#claim-agree")
    grandma.get_by_role("button", name="Claim this gift").click()
    expect(card(grandma, "Aurora ANC Headphones").get_by_test_id("claim-status")).to_have_text("You’re getting this")
    expect(grandma.get_by_test_id("available-count")).to_contain_text("3")
    shot(grandma, "v2-guest", True)

    # ---------- 4. Dad (signed in) sees it and claims another; Mom opens the same link ----------
    dad.goto(link)
    expect(card(dad, "Aurora ANC Headphones").get_by_test_id("claim-status")).to_have_text("Claimed by Grandma Jo")
    assert card(dad, "Aurora ANC Headphones").get_by_role("button", name="I’m getting this! 🎁").count() == 0
    card(dad, "Lego Titanic").get_by_role("button", name="I’m getting this! 🎁").click()
    expect(dad.locator("#claim-name")).to_have_value("Dad")
    dad.fill("#claim-name", "Papa Bear")
    dad.check("#claim-agree")
    dad.get_by_role("button", name="Claim this gift").click()
    expect(card(dad, "Lego Titanic").get_by_test_id("claim-status")).to_have_text("You’re getting this")

    # Mom got the link forwarded: same list, sees both claims (polling picks them up)
    mom.goto(link)
    expect(card(mom, "Lego Titanic").get_by_test_id("claim-status")).to_have_text("Claimed by Papa Bear")
    # Grandma's open page updates without a reload
    expect(card(grandma, "Lego Titanic").get_by_test_id("claim-status")).to_have_text("Claimed by Papa Bear", timeout=12000)
    # Dad's 8-bit character shows next to his claim for other gift buyers (guest and family)
    for buyer in (grandma, mom):
        badge = card(buyer, "Lego Titanic").get_by_test_id("claim-status").get_by_test_id("character")
        expect(badge).to_have_attribute("data-anim", "ai")
        expect(badge).to_have_attribute("aria-label", re.compile("Papa Bear"))
    dad_char_src = card(grandma, "Lego Titanic").get_by_test_id("claim-status").locator("img").get_attribute("src")
    # a guest's claim gets the house Santa instead
    expect(card(dad, "Aurora ANC Headphones").get_by_test_id("claim-status").get_by_test_id("character")).to_have_attribute("data-anim", "css")
    assert_decor_harmless(grandma, "guest list page")

    # Duplicate claim: Mom opens the dialog for Socks, Dad claims Socks first
    card(mom, "Wool Socks").get_by_role("button", name="I’m getting this! 🎁").click()
    mom.check("#claim-agree")
    card(dad, "Wool Socks").get_by_role("button", name="I’m getting this! 🎁").click()
    dad.check("#claim-agree"); dad.fill("#claim-name", "Papa Bear")
    dad.get_by_role("button", name="Claim this gift").click()
    expect(card(dad, "Wool Socks").get_by_test_id("claim-status")).to_have_text("You’re getting this")
    mom.get_by_role("button", name="Claim this gift").click()
    expect(mom.get_by_text(re.compile("Someone else just claimed Wool Socks"))).to_be_visible()
    expect(card(mom, "Wool Socks").get_by_test_id("claim-status")).to_have_text("Claimed by Papa Bear")

    # Purchased vs claimed, and cancelling
    card(grandma, "Aurora ANC Headphones").get_by_role("button", name="Mark as bought").click()
    expect(card(grandma, "Aurora ANC Headphones").get_by_test_id("claim-status")).to_have_text("You bought this ✓")
    expect(card(mom, "Aurora ANC Headphones").get_by_test_id("claim-status")).to_have_text("Bought by Grandma Jo", timeout=12000)
    card(dad, "Wool Socks").get_by_role("button", name="Cancel claim").click()
    expect(card(dad, "Wool Socks").get_by_role("button", name="I’m getting this! 🎁")).to_be_visible()
    expect(card(mom, "Wool Socks").get_by_role("button", name="I’m getting this! 🎁")).to_be_visible(timeout=12000)
    # nobody but the claimer gets claim controls
    assert card(mom, "Lego Titanic").get_by_role("button", name="Cancel claim").count() == 0
    # buyers can't edit
    assert mom.get_by_role("button", name=re.compile("^Edit ")).count() == 0

    # Mom's dashboard now shows availability for Sonny
    mom.goto(BASE + "/")
    expect(mom.get_by_test_id("member-card").filter(has_text="Sonny")).to_contain_text("2 still available")

    # ---------- 5. Sonny (owner) must find out nothing ----------
    sonny.goto(link)
    expect(sonny.get_by_test_id("owner-preview")).to_be_visible()
    expect(sonny.get_by_test_id("claim-status")).to_have_count(0)
    assert sonny.get_by_role("button", name="I’m getting this! 🎁").count() == 0
    sonny.wait_for_timeout(6000)   # longer than the buyers' polling interval
    expect(sonny.locator(".grid [data-testid=character]")).to_have_count(0)   # no claimer characters on his own list
    assert dad_char_src not in sonny.locator(".grid").inner_html()
    sonny.goto(BASE + "/my-list"); sonny.wait_for_timeout(800)
    expect(sonny.get_by_test_id("claim-status")).to_have_count(0)
    sonny.goto(BASE + "/"); sonny.wait_for_timeout(1500)
    dad_card = sonny.get_by_test_id("member-card").filter(has_text="Dad")
    expect(dad_card.get_by_test_id("character")).to_have_attribute("data-anim", "ai")
    expect(sonny.get_by_test_id("member-card").filter(has_text="Mom").get_by_test_id("character")).to_have_count(0)
    assert_decor_harmless(sonny, "dashboard")
    shot(sonny, "v3-dashboard", True)
    box = dad_card.get_by_test_id("character").bounding_box()
    sonny.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)   # clicking the character opens their list
    expect(sonny.get_by_role("heading", name="Dad’s Christmas Wishlist")).to_be_visible()
    sonny.go_back(); sonny.wait_for_timeout(800)
    me = sonny.get_by_test_id("member-card").filter(has_text="Sonny (you)")
    expect(me).to_contain_text("4 items")
    assert me.get_by_test_id("member-available").count() == 0
    # Sonny is a gift buyer for Mom, and sees availability on her card
    try:
        expect(sonny.get_by_test_id("member-card").filter(has_text="Mom")).to_contain_text("still available")
    except AssertionError:
        sonny.screenshot(path="/tmp/claude-0/shots/fail-dash.png", full_page=True); print(sonny.get_by_test_id("member-card").all_inner_texts()); raise
    # the owner's direct API attempts
    assert_no_secrets(sonny_bodies, "Sonny signed in")

    # signed out on his own device: the device guard still hides claims
    # Sonny has a PIN, so logging out is safe (no warning), and his name + PIN bring him back.
    sonny.goto(BASE + "/profile")
    expect(sonny.get_by_test_id("pin-panel")).to_contain_text("log in with Sonny and your PIN")
    expect(sonny.get_by_test_id("save-account")).to_have_count(0)
    sonny.get_by_role("button", name="Log out").click()
    expect(sonny.locator(".sitebar").get_by_role("link", name="Get started")).to_be_visible()
    assert sonny.locator(".sitebar").get_by_role("link", name="Log in").count() == 0
    sonny.goto(link); sonny.wait_for_timeout(1500)
    expect(sonny.get_by_test_id("owner-preview")).to_be_visible()
    expect(sonny.get_by_test_id("claim-status")).to_have_count(0)
    assert_no_secrets(sonny_bodies, "Sonny signed out on his device")

    # A brand-new device: typing an existing name never makes a second account.
    phone = browser.new_context(viewport={"width": 390, "height": 844}).new_page()
    phone.goto(BASE + "/signup"); phone.fill("#su-name", "  sonny "); phone.fill("#su-pin", "9999")
    phone.get_by_role("button", name="Start my wishlist").click()
    expect(phone.get_by_test_id("name-taken")).to_contain_text("already has a list")
    expect(phone.get_by_text("That PIN isn’t right. 4 tries left", exact=False)).to_be_visible()
    shot(phone, "v3-pin-taken")
    phone.fill("#su-pin", PINS["Sonny"]); phone.get_by_role("button", name="Get back into my list").click()
    expect(phone.locator(".family-title")).to_be_visible()
    phone.goto(BASE + "/my-list")
    expect(phone.get_by_role("heading", name="Sonny’s Christmas Wishlist")).to_be_visible()
    expect(card(phone, "Aurora ANC Headphones")).to_have_count(1)      # the same list, not a new empty one
    phone.context.close()

    # ---------- 6. Mom's own list is secret from her too ----------
    # ---------- 6. Mom's own list is secret from her too ----------
    sonny.goto(BASE + "/login"); sonny.fill("#li-name", "Sonny"); sonny.fill("#li-pin", "0000")
    sonny.get_by_role("button", name="Log in", exact=True).click()
    expect(sonny.get_by_text("That PIN isn’t right.", exact=False)).to_be_visible()
    sonny.fill("#li-pin", PINS["Sonny"]); sonny.get_by_role("button", name="Log in", exact=True).click()
    expect(sonny.locator(".family-title")).to_be_visible()
    mom_link = BASE + sonny.get_by_test_id("member-card").filter(has_text="Mom").get_by_role("link", name="View wishlist").get_attribute("href")
    sonny.goto(mom_link)
    card(sonny, "Cashmere Scarf").get_by_role("button", name="I’m getting this! 🎁").click()
    sonny.check("#claim-agree")
    sonny.get_by_role("button", name="Claim this gift").click()
    expect(card(sonny, "Cashmere Scarf").get_by_test_id("claim-status")).to_have_text("You’re getting this")
    mom_bodies = capture(mom)
    mom.goto(mom_link); mom.wait_for_timeout(6500)
    expect(mom.get_by_test_id("owner-preview")).to_be_visible()
    for url, body in mom_bodies:
        assert "claimer_name" not in body and "claimed_at" not in body, url

    # ---------- 7. Email accounts still work: log in with email, forgot password ----------
    # (Accounts saved with an email before PINs existed.) Made directly with the sign-in service.
    req = urllib.request.Request(os.environ.get("SUPABASE_URL", "http://localhost:54321") + "/auth/v1/signup", method="POST",
        data=json.dumps({"email": email("Uncle"), "password": PW, "data": {"display_name": "Uncle"}}).encode(),
        headers={"content-type": "application/json", "apikey": os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]})
    urllib.request.urlopen(req).read()
    uncle = browser.new_context().new_page()
    before = set(glob.glob(f"{MAIL_DIR}/*"))
    uncle.goto(BASE + "/login"); uncle.get_by_role("button", name="Saved your account with an email? Log in with email").click()
    uncle.get_by_role("link", name="Forgot password?").click()
    uncle.fill("#fp-email", email("Uncle"))
    uncle.get_by_role("button", name="Send reset link").click()
    expect(uncle.get_by_text("a reset link is on its way")).to_be_visible()
    for _ in range(40):
        new = set(glob.glob(f"{MAIL_DIR}/*")) - before
        if new: break
        time.sleep(0.25)
    assert new, "no reset email captured"
    raw = quopri.decodestring(open(new.pop(), "rb").read()).decode("utf-8", "ignore")
    reset = re.search(r'href="([^"]+/verify\?[^"]+)"', raw).group(1).replace("&amp;", "&")
    uncle.goto(reset)
    expect(uncle).to_have_url(re.compile("/reset-password"))
    uncle.fill("#rp-pass", "new-password-77"); uncle.fill("#rp-confirm", "new-password-77")
    uncle.get_by_role("button", name="Save new password").click()
    expect(uncle).to_have_url(re.compile("/login\\?reset=1"))
    uncle.fill("#li-email", email("Uncle")); uncle.fill("#li-pass", PW)
    uncle.get_by_role("button", name="Log in", exact=True).click()
    expect(uncle.get_by_text("That email and password don’t match.")).to_be_visible()
    uncle.fill("#li-pass", "new-password-77"); uncle.get_by_role("button", name="Log in", exact=True).click()
    expect(uncle.locator(".sitebar .avatar-link")).to_be_visible()
    uncle.context.close()
    dad.goto(BASE + "/")

    # ---------- 8. Leave family ----------
    dad.get_by_role("button", name="Leave The Christmas Crew").click()
    dad.get_by_role("button", name="Leave family").click()
    expect(dad.get_by_role("button", name="Create a family")).to_be_visible()
    mom.goto(BASE + "/")
    expect(mom.get_by_test_id("member-card")).to_have_count(2)

    # ---------- 9. Profile edit, link preview, protected pages ----------
    mom.goto(BASE + "/profile"); mom.fill("#pf-name", "Mum")
    mom.get_by_role("button", name="Save profile").click()
    expect(mom.get_by_text("Saved")).to_be_visible()
    meta = grandma_ctx.request.get(link).text()
    assert 'property="og:title" content="Sonny’s Christmas Wishlist 🎄"' in meta, "og:title missing"
    og = re.search(r'property="og:image" content="([^"]+)"', meta).group(1)
    img = grandma_ctx.request.get(og.replace("http://localhost:3000", BASE))
    assert img.status == 200 and img.headers["content-type"] == "image/png"
    open("/tmp/claude-0/shots/v2-og.png", "wb").write(img.body())
    anon = browser.new_page(); anon.goto(BASE + "/my-list")
    expect(anon).to_have_url(re.compile("/login\\?next=%2Fmy-list"))
    anon.goto(BASE + "/list/notARealLink1"); expect(anon.get_by_text("We couldn’t find that wishlist")).to_be_visible()

    # ---------- 9b. Decorations and character controls ----------
    sonny.goto(BASE + "/my-list"); assert_decor_harmless(sonny, "my list")
    expect(sonny.locator(".footer-parade .parade-walker")).not_to_have_count(0)
    sonny.goto(BASE + "/character")
    sonny.get_by_role("button", name="Delete my photo").click()
    sonny.get_by_role("button", name="Delete photo").click()
    expect(sonny.get_by_text("Photo deleted")).to_be_visible()
    expect(sonny.get_by_role("button", name="Regenerate character")).to_be_disabled()
    sonny.get_by_role("button", name="Delete my character").click()
    sonny.get_by_role("button", name="Delete character").click()
    expect(sonny.get_by_role("button", name="Generate my Christmas character 🎅")).to_be_visible()
    sonny.goto(BASE + "/my-list"); expect(sonny.get_by_test_id("character-cta")).to_be_visible()

    # ---------- 10. Mobile ----------
    m = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme="dark")
    mp = m.new_page(); mp.goto(link); mp.wait_for_timeout(1500)
    assert mp.evaluate("document.documentElement.scrollWidth") <= 390, "mobile horizontal scroll"
    shot(mp, "v2-mobile-guest", True)
    assert_decor_harmless(mp, "mobile guest")

    assert not errors, errors
    print("ALL MULTI-USER E2E CHECKS PASSED")
    browser.close()
