def test_model_imports():
    from worker import model  # noqa: F401

    assert model is not None
