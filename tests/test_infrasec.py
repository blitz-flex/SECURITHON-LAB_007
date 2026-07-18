import pytest
from fastapi import BackgroundTasks

from app.api.v1.endpoints import infrasec


@pytest.fixture(autouse=True)
def reset_cisa_cache(monkeypatch):
    infrasec._cisa_kev_cache.update({
        "items": [],
        "fetched_at": 0.0,
        "fetched_at_wall": None,
        "refreshing": False,
    })
    monkeypatch.setattr(infrasec, "_CISA_CACHE_TTL_SECONDS", 60 * 60)
    monkeypatch.setattr(infrasec, "_CISA_KEV_REFRESH_MODE", "ttl")
    yield
    infrasec._cisa_kev_cache.update({
        "items": [],
        "fetched_at": 0.0,
        "fetched_at_wall": None,
        "refreshing": False,
    })


@pytest.mark.asyncio
async def test_cisa_cache_reuses_fresh_data(monkeypatch):
    calls = 0

    async def fake_fetch():
        nonlocal calls
        calls += 1
        return [{"cveID": "CVE-TEST-1", "vulnerabilityName": "Test", "shortDescription": "rce"}]

    monkeypatch.setattr(infrasec, "_fetch_cisa_kev", fake_fetch)

    first = await infrasec.refresh_cisa_kev_cache(force=True)
    second = await infrasec.get_cached_cisa_kev()

    assert first == second
    assert calls == 1


@pytest.mark.asyncio
async def test_stale_cisa_cache_returns_cached_data_and_schedules_refresh(monkeypatch):
    stale_threats = [{"cveID": "CVE-STALE-1", "vulnerabilityName": "Cached", "shortDescription": "s3 policy"}]
    infrasec._cisa_kev_cache.update({"items": stale_threats, "fetched_at": 0.0, "fetched_at_wall": None, "refreshing": False})
    monkeypatch.setattr(infrasec, "_CISA_CACHE_TTL_SECONDS", 1)

    async def fail_fetch():
        raise RuntimeError("network unavailable")

    monkeypatch.setattr(infrasec, "_fetch_cisa_kev", fail_fetch)
    background_tasks = BackgroundTasks()

    threats = await infrasec.get_cached_cisa_kev(background_tasks)

    assert threats == stale_threats
    assert len(background_tasks.tasks) == 1


@pytest.mark.asyncio
async def test_empty_cisa_cache_failure_returns_empty_list(monkeypatch):
    async def fail_fetch():
        raise RuntimeError("network unavailable")

    monkeypatch.setattr(infrasec, "_fetch_cisa_kev", fail_fetch)

    threats = await infrasec.get_cached_cisa_kev()

    assert threats == []


@pytest.mark.asyncio
async def test_refresh_curriculum_reloads_live_threats(monkeypatch):
    infrasec._cisa_kev_cache.update(
        {
            "items": [{"cveID": "CVE-2020-0001", "vulnerabilityName": "Old", "shortDescription": "old"}],
            "fetched_at": 1.0,
            "refreshing": False,
        }
    )

    async def fake_fetch():
        return [{"cveID": "CVE-2025-0001", "vulnerabilityName": "New RCE", "shortDescription": "rce"}]

    monkeypatch.setattr(infrasec, "_fetch_cisa_kev", fake_fetch)

    curriculum = await infrasec._build_infrasec_curriculum(refresh=True)

    live_titles = [challenge["title"] for challenge in curriculum if challenge.get("is_live")]
    assert any("CVE-2025-0001" in title for title in live_titles)
    assert all("CVE-2020-0001" not in title for title in live_titles)


def test_weekly_cisa_cache_is_stale_after_week_roll(monkeypatch):
    from datetime import timedelta

    monkeypatch.setattr(infrasec, "_CISA_KEV_REFRESH_MODE", "weekly")
    infrasec._cisa_kev_cache.update({
        "items": [{"cveID": "CVE-2026-0001"}],
        "fetched_at": 999999.0,
        "fetched_at_wall": (infrasec._utc_now() - timedelta(days=8)).isoformat(),
        "refreshing": False,
    })

    assert infrasec._cached_cisa_kev_is_fresh() is False


def test_weekly_cisa_cache_stays_fresh_within_same_week(monkeypatch):
    monkeypatch.setattr(infrasec, "_CISA_KEV_REFRESH_MODE", "weekly")
    infrasec._cisa_kev_cache.update({
        "items": [{"cveID": "CVE-2026-0002"}],
        "fetched_at": 999999.0,
        "fetched_at_wall": infrasec._utc_now().isoformat(),
        "refreshing": False,
    })

    assert infrasec._cached_cisa_kev_is_fresh() is True


def test_live_feed_status_reports_revision(client):
    infrasec._cisa_kev_cache.update({
        "items": [
            {"cveID": "CVE-2026-1001"},
            {"cveID": "CVE-2026-1002"},
        ],
        "fetched_at": 1.0,
        "fetched_at_wall": infrasec._utc_now().isoformat(),
        "refreshing": False,
    })

    response = client.get("/api/v1/infrasec/live-feed-status")

    assert response.status_code == 200
    data = response.json()
    assert data["live_count"] == 2
    assert data["live_2026_count"] == 2
    assert data["refresh_mode"] == "ttl"
    assert data["revision"]


def _kev_fixture(year: int, count_per_track: int = 7) -> list[dict]:
    fixtures = []
    track_terms = {
        "Cloud-Native Configuration": "kubernetes cloud bucket configuration",
        "Secret Management & IAM": "hard-coded credentials iam authorization bypass",
        "Zero-Trust Network Segmentation": "vpn gateway firewall remote access",
        "Terraform State & Drift Detection": "terraform state drift infrastructure as code",
    }
    for track_index, (track, terms) in enumerate(track_terms.items(), start=1):
        for idx in range(count_per_track):
            fixtures.append(
                {
                    "cveID": f"CVE-{year}-{track_index}{idx + 1000}",
                    "vulnerabilityName": f"{track} Vulnerability",
                    "shortDescription": terms,
                    "dateAdded": f"{year}-{track_index:02d}-{idx + 1:02d}",
                }
            )
    return fixtures


def test_select_top_live_threats_filters_years_and_caps_by_year_limit():
    vulnerabilities = _kev_fixture(2025)
    vulnerabilities.extend(_kev_fixture(2024))
    vulnerabilities.extend(
        [
            {
                "cveID": "CVE-2019-8394",
                "vulnerabilityName": "File Upload Vulnerability",
                "shortDescription": "file upload",
                "dateAdded": "2025-02-01",
            },
        ]
    )
    vulnerabilities.extend(
        {
            "cveID": f"CVE-2026-{3000 + idx}",
            "vulnerabilityName": "Remote Code Execution",
            "shortDescription": "remote code execution",
            "dateAdded": "2026-01-01" if idx < 2 else "2026-02-01",
        }
        for idx in range(6)
    )

    threats = infrasec._select_top_live_threats(vulnerabilities)

    assert len(threats) == 26
    assert sum(threat["cveID"].startswith("CVE-2026-") for threat in threats) == 6
    assert sum(threat["_year"] == 2025 for threat in threats) == 20
    assert {threat["_month"] for threat in threats if threat["cveID"].startswith("CVE-2026-")} == {
        "2026-01",
        "2026-02",
    }
    year_2025_threats = [threat for threat in threats if threat["cveID"].startswith("CVE-2025-")]
    assert [threat["_lab_difficulty"] for threat in year_2025_threats] == (
        ["Easy"] * 5 + ["Medium"] * 5 + ["Hard"] * 5 + ["Critical"] * 5
    )
    assert {threat["_track_group"] for threat in year_2025_threats} == set(infrasec._TRACK_GROUPS)
    assert all(
        sum(threat["_track_group"] == track for threat in year_2025_threats) == 5
        for track in infrasec._TRACK_GROUPS
    )


def test_infrasec_years_fallback_to_balanced_top_20():
    threats = infrasec._select_top_live_threats(
        [
            {
                "cveID": f"CVE-{year}-1000",
                "vulnerabilityName": "IAM Credential Exposure",
                "shortDescription": "secret credential iam token",
                "dateAdded": f"{year}-01-01",
            }
            for year in range(2020, 2026)
        ]
    )

    for year in [2025]:
        year_threats = [threat for threat in threats if threat["_year"] == year]
        assert len(year_threats) == 20
        assert [threat["_lab_difficulty"] for threat in year_threats][0] == "Easy"
        assert [threat["_lab_difficulty"] for threat in year_threats][-1] == "Critical"
        assert {threat["_track_group"] for threat in year_threats} == set(infrasec._TRACK_GROUPS)
        assert all(
            sum(threat["_track_group"] == track for threat in year_threats) == 5
            for track in infrasec._TRACK_GROUPS
        )


def test_2026_keeps_all_records_grouped_by_month_metadata():
    vulnerabilities = [
        {
            "cveID": f"CVE-2026-{3000 + idx}",
            "vulnerabilityName": "Remote Access Gateway Vulnerability",
            "shortDescription": "vpn gateway remote access",
            "dateAdded": "2026-01-01" if idx < 3 else "2026-02-01",
        }
        for idx in range(9)
    ]

    threats = infrasec._select_top_live_threats(vulnerabilities)

    assert len(threats) == len(vulnerabilities)
    assert {threat["_month"] for threat in threats} == {"2026-01", "2026-02"}
    assert all(threat["_year_limit"] == len(vulnerabilities) for threat in threats)


def test_live_real_metadata_range_covers_2020_to_2026():
    vulnerabilities = []
    for year in range(2020, 2026):
        vulnerabilities.extend(_kev_fixture(year, count_per_track=5))
    vulnerabilities.extend(
        {
            "cveID": f"CVE-2026-{idx + 4000}",
            "vulnerabilityName": "Cloud Configuration Vulnerability",
            "shortDescription": "cloud kubernetes configuration",
            "dateAdded": "2026-03-01",
        }
        for idx in range(4)
    )

    challenges = [
        infrasec._build_live_challenge(threat, 100 + idx)
        for idx, threat in enumerate(infrasec._select_top_live_threats(vulnerabilities))
    ]

    live_real_ids = [challenge["id"] for challenge in challenges]
    assert live_real_ids[0] == "LIVE_REAL_100"
    assert live_real_ids[-1] == f"LIVE_REAL_{99 + len(challenges)}"
    assert {challenge["year"] for challenge in challenges} == {2025, 2026}
    assert max(challenge["year_rank"] for challenge in challenges if challenge["year"] != 2026) == 20
    assert all(challenge["track_group"] in infrasec._TRACK_GROUPS for challenge in challenges)


def test_build_live_challenge_includes_year_group_and_rank():
    challenge = infrasec._build_live_challenge(
        {
            "cveID": "CVE-2021-40539",
            "vendorProject": "Zoho",
            "product": "ADSelfService Plus",
            "vulnerabilityName": "Authentication Bypass Vulnerability",
            "shortDescription": "authentication bypass allows remote code execution",
            "dateAdded": "2021-09-07",
            "_track_group": "Secret Management & IAM",
        },
        100,
    )

    assert challenge["year"] == 2021
    assert challenge["month"] == "2021-09"
    assert challenge["track_group"] == "Secret Management & IAM"
    assert challenge["threat_group"] == "Authentication Bypass"
    assert challenge["top_rank"] == 1
    assert challenge["year_limit"] == 20
    assert challenge["category"] == "2021 / Secret Management & IAM"
    assert challenge["cve_id"] == "CVE-2021-40539"
    assert challenge["display_title"] == "CVE-2021-40539 · Zoho ADSelfService Plus · Authentication Bypass"
    assert challenge["target_label"] == "Zoho ADSelfService Plus · Authentication Bypass"
    assert challenge["attack_theme"] == "Authentication Bypass"
    assert "Zero-Trust Network Segmentation" not in challenge["display_title"]
    assert len(challenge["display_title"]) < 80


def test_display_title_ivanti_epmm_code_injection():
    challenge = infrasec._build_live_challenge(
        {
            "cveID": "CVE-2026-1281",
            "vendorProject": "Ivanti",
            "product": "Endpoint Manager Mobile",
            "vulnerabilityName": "Ivanti Endpoint Manager Mobile (EPMM) Code Injection Vulnerability",
            "shortDescription": "Ivanti EPMM contains a code injection vulnerability.",
            "dateAdded": "2026-01-15",
            "_track_group": "Zero-Trust Network Segmentation",
        },
        101,
    )

    assert challenge["display_title"] == "CVE-2026-1281 · Ivanti EPMM · Code Injection"
    assert challenge["target_label"] == "Ivanti EPMM · Code Injection"
    assert challenge["target_vendor"] == "Ivanti"
    assert challenge["target_product"] == "EPMM"
    assert challenge["attack_theme"] == "Code Injection"
    assert challenge["track_group"] == "Zero-Trust Network Segmentation"
    assert challenge["track_group"] not in challenge["display_title"]
    assert challenge["remediation_theme"] == "validate input and tighten network access rules"
    assert len(challenge["situation_report"]) > 200
    assert "What happened" in challenge["situation_report"]
    assert "What you need to do" in challenge["situation_report"]


def test_display_title_fallback_without_vendor_product():
    challenge = infrasec._build_live_challenge(
        {
            "cveID": "CVE-2020-9999",
            "vulnerabilityName": "Unknown issue",
            "shortDescription": "unspecified weakness",
            "dateAdded": "2020-06-01",
            "_track_group": "Cloud-Native Configuration",
        },
        102,
    )

    assert challenge["display_title"] == "CVE-2020-9999 · Configuration Hardening"
    assert challenge["target_label"] == "Configuration Hardening"
    assert challenge["target_vendor"] is None
    assert challenge["target_product"] is None
