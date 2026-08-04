from pathlib import Path

from playwright.sync_api import sync_playwright

from app.publisher.playwright_page import PlaywrightPublisherPage


def test_playwright_page_uses_selector_fallbacks_on_local_simulator(
    tmp_path: Path,
) -> None:
    video = tmp_path / "video.mp4"
    video.write_bytes(b"test")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <input id="video" type="file">
            <textarea placeholder="填写标题"></textarea>
            <button id="schedule">定时发布</button>
            <input placeholder="发布日期">
            <input placeholder="发布时间">
            <button aria-label="发布作品" onclick="document.body.dataset.done='1'">提交</button>
            """
        )
        facade = PlaywrightPublisherPage(page)

        facade.upload([".missing", "input[type=file]"], str(video))
        facade.fill([".missing", "textarea[placeholder*=标题]"], "本地仿真")
        facade.click([".missing", "[aria-label*=发布]"])
        facade.set_schedule(
            ["#schedule"],
            ['input[placeholder*=发布日期]'],
            ['input[placeholder*=发布时间]'],
            __import__("datetime").datetime.fromisoformat("2026-08-04T20:30:00+08:00"),
        )

        assert page.locator("textarea").input_value() == "本地仿真"
        assert page.locator("body").get_attribute("data-done") == "1"
        assert page.locator('input[placeholder*=发布日期]').input_value() == "2026-08-04"
        assert page.locator('input[placeholder*=发布时间]').input_value() == "20:30"
        browser.close()
