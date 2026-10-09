import pytest

from domain.load.tss import hr_tss, intensity_factor, power_tss


def test_tss_one_hour_at_ftp() -> None:
    assert power_tss(duration_s=3600, np=200.0, ftp=200.0) == pytest.approx(100.0, abs=0.5)


def test_intensity_factor() -> None:
    assert intensity_factor(np=200.0, ftp=250.0) == pytest.approx(0.8)


def test_hr_tss_zone_accumulation() -> None:
    zones = {2: 5400.0}

    assert hr_tss(zones) == pytest.approx(90.0, abs=5.0)
