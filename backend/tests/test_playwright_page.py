from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright
import pytest

import app.publisher.playwright_page as playwright_page_module
from app.publisher.playwright_page import PersistentBrowserSession, PlaywrightPublisherPage, resolve_bundled_chromium


def test_resolve_bundled_chromium_uses_packaged_chrome(monkeypatch, tmp_path: Path) -> None:
    chrome = tmp_path / "chromium-1181" / "chrome-win" / "chrome.exe"
    chrome.parent.mkdir(parents=True)
    chrome.write_bytes(b"browser")
    monkeypatch.setenv("PLAYWRIGHT_BROWSERS_PATH", str(tmp_path))
    assert resolve_bundled_chromium() == str(chrome)


def test_resolve_bundled_chromium_returns_none_without_packaged_browser(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PLAYWRIGHT_BROWSERS_PATH", str(tmp_path))
    assert resolve_bundled_chromium() is None


def test_playwright_page_uses_selector_fallbacks_on_local_simulator(tmp_path: Path) -> None:
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
        facade.set_schedule(["#schedule"], ['input[placeholder*=发布日期]'], ['input[placeholder*=发布时间]'], datetime.fromisoformat("2026-08-04T20:30:00+08:00"))
        assert page.locator("textarea").input_value() == "本地仿真"
        assert page.locator("body").get_attribute("data-done") == "1"
        assert page.locator('input[placeholder*=发布日期]').input_value() == "2026-08-04"
        assert page.locator('input[placeholder*=发布时间]').input_value() == "20:30"
        browser.close()


def test_schedule_converts_utc_to_shanghai_time_across_date_boundary() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <button id="schedule">定时发布</button>
            <input id="date" placeholder="发布日期">
            <input id="time" placeholder="发布时间">
            """
        )
        facade = PlaywrightPublisherPage(page)

        facade.set_schedule(
            ["#schedule"], ["#date"], ["#time"],
            datetime.fromisoformat("2026-08-26T19:03:00+00:00"),
        )

        assert page.locator("#date").input_value() == "2026-08-27"
        assert page.locator("#time").input_value() == "03:03"
        browser.close()


def test_schedule_does_not_require_system_timezone_database(monkeypatch) -> None:
    import zoneinfo

    def unavailable(_key: str):
        raise zoneinfo.ZoneInfoNotFoundError("tzdata unavailable")

    monkeypatch.setattr(zoneinfo, "ZoneInfo", unavailable)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <button id="schedule">定时发布</button>
            <input id="date" placeholder="发布日期">
            <input id="time" placeholder="发布时间">
            """
        )
        facade = PlaywrightPublisherPage(page)

        facade.set_schedule(
            ["#schedule"], ["#date"], ["#time"],
            datetime.fromisoformat("2026-08-26T19:03:00+00:00"),
        )

        assert page.locator("#date").input_value() == "2026-08-27"
        assert page.locator("#time").input_value() == "03:03"
        browser.close()


def test_schedule_rejects_platform_default_when_control_ignores_target_value() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <button id="schedule">定时发布</button>
            <input id="date" placeholder="日期" value="2026-08-12">
            <input id="time" placeholder="时间" value="16:40">
            <script>
              for (const input of document.querySelectorAll('input')) {
                input.addEventListener('blur', () => {
                  document.querySelector('#date').value='2026-08-12';
                  document.querySelector('#time').value='16:40';
                });
              }
            </script>
            """
        )
        facade = PlaywrightPublisherPage(page)

        with pytest.raises(RuntimeError, match="平台时间设置失败.*目标 2026-08-28 05:00.*页面实际 2026-08-12 16:40"):
            facade.set_schedule(
                ["#schedule"], ["#date"], ["#time"],
                datetime.fromisoformat("2026-08-27T21:00:00+00:00"),
            )
        browser.close()


def test_schedule_selects_date_and_time_through_platform_picker() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <button id="schedule">定时发布</button>
            <input id="date" placeholder="日期" value="2026-08-12" readonly>
            <input id="time" placeholder="时间" value="17:00" readonly>
            <div id="calendar" hidden>
              <button data-date="2026-08-17">17</button>
            </div>
            <div id="clock" hidden>
              <button data-time="09:00">09:00</button>
            </div>
            <script>
              date.onclick = () => calendar.hidden = false;
              time.onclick = () => clock.hidden = false;
              document.querySelector('[data-date]').onclick = (event) => {
                date.value = event.target.dataset.date;
                calendar.hidden = true;
              };
              document.querySelector('[data-time]').onclick = (event) => {
                time.value = event.target.dataset.time;
                clock.hidden = true;
              };
            </script>
            """
        )
        facade = PlaywrightPublisherPage(page)

        facade.set_schedule(
            ["#schedule"], ["#date"], ["#time"],
            datetime.fromisoformat("2026-08-17T09:00:00+08:00"),
        )

        assert page.locator("#date").input_value() == "2026-08-17"
        assert page.locator("#time").input_value() == "09:00"
        browser.close()


def test_schedule_uses_single_douyin_datetime_control_once() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <button id="schedule">定时发布</button>
            <input id="datetime" placeholder="日期和时间" format="yyyy-MM-dd HH:mm" value="2026-08-12 17:40">
            <script>
              window.datetimeChanges = 0;
              datetime.addEventListener('input', () => window.datetimeChanges += 1);
            </script>
            """
        )
        facade = PlaywrightPublisherPage(page)

        facade.set_schedule(
            ["#schedule"], ['input[placeholder="日期和时间"]'],
            ['input[placeholder="日期和时间"]'],
            datetime.fromisoformat("2026-08-17T13:00:00+08:00"),
        )

        assert page.locator("#datetime").input_value() == "2026-08-17 13:00"
        assert page.evaluate("window.datetimeChanges") > 0
        browser.close()


def test_playwright_page_waits_for_delayed_publish_form() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content("<div id='root'></div>")
        page.evaluate("setTimeout(() => document.querySelector('#root').innerHTML = '<textarea placeholder=作品简介></textarea>', 100)")
        facade = PlaywrightPublisherPage(page, timeout_ms=2_000)
        facade.fill(['textarea[placeholder*="作品简介"]'], "正文内容")
        assert page.locator("textarea").input_value() == "正文内容"
        browser.close()


def test_upload_ready_does_not_treat_visible_cover_controls_as_upload_completion() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content('<button>设置封面</button><div id="status"></div>')
        page.evaluate(
            "setTimeout(() => document.querySelector('#status').textContent = '上传完成', 100)"
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=2_000)

        assert facade.wait_for_upload_ready() is True
        assert page.locator("#status").inner_text() == "上传完成"
        browser.close()


def test_upload_ready_accepts_explicit_success_when_stale_processing_text_remains(monkeypatch) -> None:
    clock = iter((0.0, 0.0, 301.0))
    monkeypatch.setattr(playwright_page_module, "monotonic", lambda: next(clock))
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            "<div>\u4e0a\u4f20\u6210\u529f</div>"
            "<div>\u5904\u7406\u4e2d</div>"
            "<input placeholder='\u4f5c\u54c1\u6807\u9898'>"
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=1_000)

        assert facade.wait_for_upload_ready() is True
        browser.close()


def test_upload_ready_does_not_treat_normal_reupload_action_as_failure() -> None:
    """抖音上传成功页会保留“重新上传”操作，它不是失败提示。"""
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            '<div role="status">极速上传成功，上传时间14秒</div>'
            '<button type="button">重新上传</button>'
            '<input placeholder="作品标题">'
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=1_000)

        assert facade.wait_for_upload_ready() is True
        browser.close()


def test_douyin_metadata_keeps_title_and_hashtags_in_separate_controls() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content('<input id="title" placeholder="作品标题"><div id="description" contenteditable="true" data-placeholder="作品描述"></div>')
        facade = PlaywrightPublisherPage(page)
        facade.fill_douyin_metadata(
            ['input[placeholder*="作品标题"]'],
            ['[contenteditable="true"][data-placeholder*="作品描述"]'],
            "独立标题", "", ["工厂", "定制"],
        )
        assert page.locator("#title").input_value() == "独立标题"
        assert "#工厂 #定制" in page.locator("#description").inner_text()
        browser.close()


def test_douyin_metadata_keeps_typing_after_description_placeholder_changes_on_focus() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <input id="title" placeholder="作品标题">
            <div
              id="description"
              contenteditable="true"
              data-placeholder="添加作品简介"
              onfocus="this.removeAttribute('data-placeholder')"
            ></div>
            """
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=1_000)
        facade.fill_douyin_metadata(
            ['input[placeholder*="作品标题"]'],
            ['[contenteditable="true"][data-placeholder*="添加作品简介"]'],
            "独立标题", "", ["工厂", "定制"],
        )
        assert page.locator("#title").input_value() == "独立标题"
        assert "#工厂 #定制" in page.locator("#description").inner_text()
        browser.close()


def test_cover_upload_opens_cover_workflow_before_selecting_file(tmp_path: Path) -> None:
    cover = tmp_path / "cover.jpg"
    cover.write_bytes(b"cover")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content('''<button id="open" onclick="document.querySelector('#cover').style.display='block'">设置封面</button><input id="cover" type="file" accept="image/*" style="display:none"><button id="confirm">确认</button>''')
        facade = PlaywrightPublisherPage(page)
        facade.upload_cover(['#open'], ['#cover'], str(cover))
        assert page.locator("#cover").input_value().endswith("cover.jpg")
        browser.close()


def test_cover_upload_uses_cover_file_chooser_when_image_input_is_not_visible(tmp_path: Path) -> None:
    cover = tmp_path / "cover.jpg"
    cover.write_bytes(b"cover")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <button id="open" onclick="document.querySelector('#dialog').style.display='block'">设置封面</button>
            <div id="dialog" role="dialog" style="display:none">
              <button id="upload">上传封面</button>
              <button id="confirm">完成</button>
            </div>
            <input id="selected" type="hidden">
            <script>
              document.querySelector('#upload').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.addEventListener('change', () => {
                  document.querySelector('#selected').value = input.files[0].name;
                });
                input.click();
              });
            </script>
            """
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=1_000)
        facade.upload_cover(['#open'], ['input[type=file][accept*="image"]'], str(cover))
        assert page.locator("#selected").input_value() == "cover.jpg"
        browser.close()


def test_douyin_cover_upload_sets_vertical_cover_then_confirms_horizontal_default(tmp_path: Path) -> None:
    cover = tmp_path / "cover.jpg"
    cover.write_bytes(b"cover")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <button id="open" onclick="document.querySelector('#dialog').style.display='block'">设置封面</button>
            <div id="dialog" role="dialog" style="display:none">
              <button id="verticalTab">设置竖封面</button>
              <button id="horizontalTab">设置横封面</button>
              <section id="vertical">
                <input id="verticalCover" type="file" accept="image/*">
                <button id="toHorizontal" onclick="
                  if (document.body.dataset.verticalUploaded === '1') {
                    document.body.dataset.horizontalStep = '1';
                    document.querySelector('#vertical').style.display='none';
                    document.querySelector('#horizontal').style.display='block';
                  }
                ">设置横封面</button>
              </section>
              <section id="horizontal" style="display:none">
                <button id="done" onclick="document.body.dataset.done='1'">完成</button>
              </section>
            </div>
            <script>
              document.querySelector('#verticalCover').addEventListener('change', () => {
                document.body.dataset.verticalUploaded = '1';
                document.body.dataset.coverName = document.querySelector('#verticalCover').files[0].name;
              });
            </script>
            """
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=1_000)
        facade.upload_cover(["#open"], ["#verticalCover"], str(cover))
        assert page.locator("body").get_attribute("data-cover-name") == "cover.jpg"
        browser.close()


def test_douyin_cover_upload_sets_independent_vertical_and_horizontal_files(tmp_path: Path) -> None:
    vertical = tmp_path / "vertical.jpg"
    horizontal = tmp_path / "horizontal.jpg"
    vertical.write_bytes(b"vertical")
    horizontal.write_bytes(b"horizontal")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <div class="content-upload-new">
              <span>设置封面</span>
              <div class="coverControl-currentBuild" role="button" onclick="document.querySelector('#dialog').style.display='block'">
                <span>选择封面</span><span>竖封面3:4</span>
              </div>
            </div>
            <div id="dialog" role="dialog" style="display:none">
              <section id="vertical">
                <span>竖封面预览（3:4）</span>
                <button onclick="document.querySelector('#verticalCover').click()">上传封面</button>
                <input id="verticalCover" type="file" accept="image/*">
                <button id="horizontalTab" onclick="show('horizontal')">设置横封面</button>
              </section>
              <section id="horizontal" style="display:none">
                <span>横封面预览（4:3）</span>
                <button onclick="document.querySelector('#horizontalCover').click()">上传封面</button>
                <input id="horizontalCover" type="file" accept="image/*">
                <button id="verticalTab" onclick="show('vertical')">设置竖封面</button>
                <button id="done" onclick="document.body.dataset.done='1'">完成</button>
              </section>
            </div>
            <script>
              function show(id) {
                document.querySelector('#vertical').style.display = id === 'vertical' ? 'block' : 'none';
                document.querySelector('#horizontal').style.display = id === 'horizontal' ? 'block' : 'none';
              }
              document.querySelector('#verticalCover').addEventListener('change', () => document.body.dataset.verticalName = document.querySelector('#verticalCover').files[0].name);
              document.querySelector('#horizontalCover').addEventListener('change', () => document.body.dataset.horizontalName = document.querySelector('#horizontalCover').files[0].name);
            </script>
            """
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=1_000)
        facade.upload_cover_assets(
            ["#open"],
            ['input[type=file][accept*="image"]'],
            str(vertical),
            str(horizontal),
            supports_dual_cover=True,
        )
        assert page.locator("body").get_attribute("data-vertical-name") == "vertical.jpg"
        assert page.locator("body").get_attribute("data-horizontal-name") == "horizontal.jpg"
        assert page.locator("body").get_attribute("data-done") == "1"
        browser.close()


def _dual_cover_fixture(page) -> None:
    page.set_content(
        """
        <div class="content-upload-new">
          <span id="heading">设置封面</span>
          <div class="coverControl-randomBuild" role="button" onclick="openCover()">
            <span>选择封面</span><span>竖封面3:4</span>
          </div>
          <div class="coverControl-anotherBuild" role="button"><span>选择封面</span><span>横封面4:3</span></div>
        </div>
        <div id="dialog" role="dialog" style="display:none">
          <section id="verticalPanel">
            <span>竖封面预览（3:4）</span>
            <button id="uploadVertical" onclick="log('upload:vertical'); document.querySelector('#verticalFile').click()">上传封面</button>
            <input id="verticalFile" type="file" accept="image/*" style="display:none">
            <button id="horizontalMode" onclick="showMode('horizontal')">设置横封面</button>
          </section>
          <section id="horizontalPanel" style="display:none">
            <span>横封面预览（4:3）</span>
            <button id="uploadHorizontal" onclick="log('upload:horizontal'); document.querySelector('#horizontalFile').click()">上传封面</button>
            <input id="horizontalFile" type="file" accept="image/*" style="display:none">
            <button id="verticalMode" onclick="showMode('vertical')">设置竖封面</button>
            <button id="done" onclick="log('done')">完成</button>
          </section>
        </div>
        <script>
          window.actions = [];
          function log(value) { window.actions.push(value); }
          function openCover() {
            log('open:vertical');
            document.querySelector('#dialog').style.display = 'block';
          }
          function showMode(mode) {
            log('mode:' + mode);
            document.querySelector('#verticalPanel').style.display = mode === 'vertical' ? 'block' : 'none';
            document.querySelector('#horizontalPanel').style.display = mode === 'horizontal' ? 'block' : 'none';
          }
          document.querySelector('#verticalFile').addEventListener('change', () => log('file:' + document.querySelector('#verticalFile').files[0].name));
          document.querySelector('#horizontalFile').addEventListener('change', () => log('file:' + document.querySelector('#horizontalFile').files[0].name));
        </script>
        """
    )


def test_douyin_dual_cover_follows_vertical_then_horizontal_workflow(tmp_path: Path) -> None:
    vertical = tmp_path / "vertical.jpg"
    horizontal = tmp_path / "horizontal.jpg"
    vertical.write_bytes(b"vertical")
    horizontal.write_bytes(b"horizontal")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        _dual_cover_fixture(page)
        facade = PlaywrightPublisherPage(page, timeout_ms=1_000)
        facade.upload_cover_assets(['text="设置封面"'], ['input[type=file]'], str(vertical), str(horizontal), supports_dual_cover=True)
        assert page.evaluate("window.actions") == [
            "open:vertical", "file:vertical.jpg",
            "mode:horizontal", "file:horizontal.jpg", "done",
        ]
        browser.close()


def test_douyin_cover_fallback_uses_current_upload_input_and_saves_crop(tmp_path: Path) -> None:
    vertical = tmp_path / "vertical.jpg"
    vertical.write_bytes(b"vertical")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <div class="content-upload-new">
              <div class="coverControl-build" onclick="document.querySelector('#editor').style.display='block'"><span>选择封面</span><span>竖封面3:4</span></div>
            </div>
            <input id="wrongHorizontalInput" type="file" accept="image/*" style="display:none">
            <div id="editor" role="dialog" style="display:none">
              <section id="verticalPanel"><span>竖封面预览（3:4）</span>
              <div id="verticalUpload">
                <span id="uploadText" onclick="showCrop()">上传封面</span>
                <input id="verticalInput" type="file" accept="image/*" style="display:none">
              </div>
              <button onclick="showHorizontal()">设置横封面</button></section>
              <section id="horizontalPanel" style="display:none"><span>横封面预览（4:3）</span><button onclick="window.actions.push('done')">完成</button></section>
              <div id="crop" role="dialog" style="display:none">
                <h2>设置封面</h2>
                <button onclick="saveCrop()">保存</button>
              </div>
            </div>
            <script>
              window.actions = [];
              function showCrop() { document.querySelector('#crop').style.display = 'block'; }
              function saveCrop() { window.actions.push('crop:save'); document.querySelector('#crop').style.display = 'none'; }
              function showHorizontal() { window.actions.push('mode:horizontal'); document.querySelector('#verticalPanel').style.display = 'none'; document.querySelector('#horizontalPanel').style.display = 'block'; }
              document.querySelector('#wrongHorizontalInput').addEventListener('change', () => window.actions.push('wrong:' + document.querySelector('#wrongHorizontalInput').files[0].name));
              document.querySelector('#verticalInput').addEventListener('change', () => { window.actions.push('vertical:' + document.querySelector('#verticalInput').files[0].name); showCrop(); });
            </script>
            """
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=250)
        facade.upload_cover_assets(['text="设置封面"'], ['input[type=file][accept*="image"]'], str(vertical), None, supports_dual_cover=True)
        assert page.evaluate("window.actions") == ["vertical:vertical.jpg", "crop:save", "mode:horizontal", "done"]
        browser.close()


def test_douyin_cover_uses_owned_input_without_waiting_for_upload_button(tmp_path: Path) -> None:
    vertical = tmp_path / "vertical.jpg"
    vertical.write_bytes(b"vertical")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <div class="content-upload-new">
              <div class="coverControl-build" onclick="document.querySelector('#editor').style.display='block'">
                <span>选择封面</span><span>竖封面3:4</span>
              </div>
            </div>
            <div id="editor" role="dialog" style="display:none">
              <section id="verticalPanel">
                <span>竖封面预览（3:4）</span>
                <div id="uploadArea">
                  <span onclick="document.body.dataset.uploadButtonClicked='1'">上传封面</span>
                  <input id="verticalInput" type="file" accept="image/*" style="display:none">
                </div>
                <div onclick="showHorizontal()">设置横封面</div>
              </section>
              <section id="horizontalPanel" style="display:none">
                <span>横封面预览（4:3）</span><div onclick="document.body.dataset.done='1'">完成</div>
              </section>
            </div>
            <script>
              function showHorizontal() {
                document.querySelector('#verticalPanel').style.display='none';
                document.querySelector('#horizontalPanel').style.display='block';
              }
              document.querySelector('#verticalInput').addEventListener('change', () => {
                document.body.dataset.verticalName=document.querySelector('#verticalInput').files[0].name;
              });
            </script>
            """
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=500)

        facade.upload_cover_assets([], ['input[type=file][accept*="image"]'], str(vertical), None, supports_dual_cover=True)

        assert page.locator("body").get_attribute("data-vertical-name") == "vertical.jpg"
        assert page.locator("body").get_attribute("data-upload-button-clicked") is None
        assert page.locator("body").get_attribute("data-done") == "1"
        browser.close()


def test_douyin_cover_confirm_clicks_visible_non_button_done(tmp_path: Path) -> None:
    horizontal = tmp_path / "horizontal.jpg"
    horizontal.write_bytes(b"horizontal")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(
            """
            <div class="content-upload-new">
              <div class="coverControl-build" onclick="document.querySelector('#editor').style.display='block'">
                <span>选择封面</span><span>竖封面3:4</span>
              </div>
            </div>
            <div id="editor" role="dialog" style="display:none">
              <section id="vertical"><span>竖封面预览（3:4）</span><div onclick="showHorizontal()">设置横封面</div></section>
              <section id="horizontal" style="display:none">
                <span>横封面预览（4:3）</span>
                <span onclick="document.querySelector('#horizontalInput').click()">上传封面</span>
                <input id="horizontalInput" type="file" accept="image/*" style="display:none">
                <div class="footer-action" onclick="document.body.dataset.done='1'">完成</div>
              </section>
            </div>
            <script>
              function showHorizontal() {
                document.querySelector('#vertical').style.display = 'none';
                document.querySelector('#horizontal').style.display = 'block';
              }
            </script>
            """
        )
        facade = PlaywrightPublisherPage(page, timeout_ms=500)
        facade.upload_cover_assets([], ['input[type=file][accept*="image"]'], None, str(horizontal), supports_dual_cover=True)
        assert page.locator("body").get_attribute("data-done") == "1"
        browser.close()


def test_douyin_vertical_only_switches_to_horizontal_before_confirm(tmp_path: Path) -> None:
    vertical = tmp_path / "vertical.jpg"
    vertical.write_bytes(b"vertical")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        _dual_cover_fixture(page)
        facade = PlaywrightPublisherPage(page, timeout_ms=1_000)
        facade.upload_cover_assets(['text="设置封面"'], ['input[type=file]'], str(vertical), None, supports_dual_cover=True)
        assert page.evaluate("window.actions") == [
            "open:vertical", "file:vertical.jpg", "mode:horizontal", "done",
        ]
        browser.close()


def test_douyin_horizontal_only_switches_to_vertical_before_confirm(tmp_path: Path) -> None:
    horizontal = tmp_path / "horizontal.jpg"
    horizontal.write_bytes(b"horizontal")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        _dual_cover_fixture(page)
        facade = PlaywrightPublisherPage(page, timeout_ms=1_000)
        facade.upload_cover_assets(['text="设置封面"'], ['input[type=file]'], None, str(horizontal), supports_dual_cover=True)
        assert page.evaluate("window.actions") == [
            "open:vertical", "mode:horizontal", "file:horizontal.jpg", "done",
        ]
        browser.close()


def test_diagnostics_requestfailed_accepts_string_failure() -> None:
    class FakeDiagnostics:
        def __init__(self) -> None:
            self.network_failures: list[tuple[str, str, str]] = []

        def console(self, *_args, **_kwargs) -> None:
            pass

        def browser_exit(self, *_args, **_kwargs) -> None:
            pass

        def network_failure(self, method: str, url: str, error_text: str) -> None:
            self.network_failures.append((method, url, error_text))

    class FakePage:
        url = "https://creator.douyin.com/creator-micro/content/upload"

        def __init__(self) -> None:
            self.handlers = {}

        def on(self, event: str, handler) -> None:
            self.handlers[event] = handler

    class FakeContext:
        def __init__(self, page: FakePage) -> None:
            self.pages = [page]
            self.handlers = {}

        def on(self, event: str, handler) -> None:
            self.handlers[event] = handler

    class FakeRequest:
        method = "GET"
        url = "https://example.invalid/api"
        failure = "net::ERR_FAILED"

    page = FakePage()
    diagnostics = FakeDiagnostics()
    session = PersistentBrowserSession.__new__(PersistentBrowserSession)
    session.context = FakeContext(page)
    session.diagnostics = diagnostics

    session._attach_diagnostics()
    page.handlers["requestfailed"](FakeRequest())

    assert diagnostics.network_failures == [("GET", "https://example.invalid/api", "net::ERR_FAILED")]
