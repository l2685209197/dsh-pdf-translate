from worker import rebuild


def test_base14_font_resolved():
    resolver = rebuild.FontResolver()
    fn, ff = resolver.resolve(font="Helvetica", text="Hello", lang="en")
    assert fn == "helv" and ff is None


def test_cjk_fallback_for_latin_font():
    resolver = rebuild.FontResolver()
    fn, ff = resolver.resolve(font="Helvetica", text="你好世界", lang="en")
    assert fn in ("china-s", "msyh")
    assert fn == "china-s" or ff is not None


def test_monospace_resolved():
    resolver = rebuild.FontResolver()
    fn, ff = resolver.resolve(font="CourierNewPSMT", text="code()", lang="en")
    assert fn == "cour" and ff is None


def test_cjk_with_cjk_font_uses_cjk():
    resolver = rebuild.FontResolver()
    fn, ff = resolver.resolve(font="SimSun", text="你好", lang="zh")
    assert fn in ("china-s", "msyh", "SimSun")
