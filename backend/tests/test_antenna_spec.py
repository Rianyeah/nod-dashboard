"""
Tests for the antenna spec normalisation logic in routers/rf_tilt.py.
Uses unittest — no external dependencies needed.
"""
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routers.rf_tilt import _normalise_antenna_type


class TestNormaliseAntennaType(unittest.TestCase):
    """Tests for _normalise_antenna_type() — the core normalisation logic."""

    # --- Huawei passive antennas ---

    def test_huawei_ape_with_version(self):
        self.assertEqual(_normalise_antenna_type("APE4516R1v06"), "APE4516R1")

    def test_huawei_ape_with_prefix_and_vendor(self):
        self.assertEqual(
            _normalise_antenna_type("Antenna Sectoral APE4516R1v06 Huawei"),
            "APE4516R1",
        )

    def test_huawei_atr_without_r(self):
        self.assertEqual(_normalise_antenna_type("ATR 451704v01"), "ATR451704")
        self.assertEqual(_normalise_antenna_type("ATR451704V01"), "ATR451704")

    def test_huawei_adu_without_r(self):
        self.assertEqual(_normalise_antenna_type("ADU451816V02"), "ADU451816")
        self.assertEqual(_normalise_antenna_type("ADU451816v02"), "ADU451816")

    def test_huawei_adu_with_r(self):
        self.assertEqual(_normalise_antenna_type("ADU4517R6v06"), "ADU4517R6")

    def test_huawei_pd_type(self):
        self.assertEqual(_normalise_antenna_type("A12264PD01V06"), "A12264PD01")
        self.assertEqual(_normalise_antenna_type("A12264PD01v06"), "A12264PD01")

    def test_huawei_underscore_prefix(self):
        self.assertEqual(_normalise_antenna_type("Huawei_APE4516R1v06"), "APE4516R1")
        self.assertEqual(_normalise_antenna_type("Huawei_ADU451816V02"), "ADU451816")

    def test_huawei_concatenated(self):
        self.assertEqual(
            _normalise_antenna_type("AntennaSectoralADU451816v01Huawei"),
            "ADU451816",
        )

    def test_huawei_a704516r0(self):
        self.assertEqual(_normalise_antenna_type("A704516R0v06"), "A704516R0")

    def test_huawei_a79451700(self):
        self.assertEqual(_normalise_antenna_type("A79451700v06"), "A79451700")
        self.assertEqual(_normalise_antenna_type("A79451700V02"), "A79451700")

    def test_huawei_a08260pd(self):
        self.assertEqual(_normalise_antenna_type("A08260PD00v06"), "A08260PD00")

    def test_huawei_asi4518r42(self):
        self.assertEqual(_normalise_antenna_type("ASI4518R42v06"), "ASI4518R42")
        self.assertEqual(
            _normalise_antenna_type("Antenna RF ASI4518R42v06 Huawei"),
            "ASI4518R42",
        )

    # --- Huawei AAU (active) ---

    def test_aau5336(self):
        self.assertEqual(_normalise_antenna_type("AAU5336"), "AAU5336")

    def test_aau_with_fcc_id(self):
        self.assertEqual(
            _normalise_antenna_type("AAU5336 (WD7MQTQC49JV) Huawei"),
            "AAU5336",
        )

    def test_haau_strips_h_prefix(self):
        self.assertEqual(_normalise_antenna_type("Antenna HAAU5323 Huawei"), "AAU5323")

    # --- Commscope/Andrew ---

    def test_hbxx_with_vtm(self):
        self.assertEqual(_normalise_antenna_type("ANDREW HBXX-6516DS-VTM"), "HBXX-6516DS")
        self.assertEqual(
            _normalise_antenna_type("Antenna Sectoral HBXX-6516DS-VTM Andrew"),
            "HBXX-6516DS",
        )

    def test_hbxx_no_hyphen(self):
        self.assertEqual(_normalise_antenna_type("HBXX6516DSVTM"), "HBXX-6516DS")

    def test_ldx_with_vtm(self):
        self.assertEqual(_normalise_antenna_type("LDX-9014DS-VTM"), "LDX-9014DS")

    def test_hbx_with_vtm(self):
        self.assertEqual(_normalise_antenna_type("ANDREW HBX-6513DS-VTM"), "HBX-6513DS")

    def test_dbxlh(self):
        self.assertEqual(_normalise_antenna_type("ANDREW DBXLH-6565C-VTM"), "DBXLH-6565C")

    def test_commscope_underscore_prefix(self):
        self.assertEqual(_normalise_antenna_type("Commscope_LDX9014DSVTM"), "LDX-9014DS")
        self.assertEqual(_normalise_antenna_type("Commscope_HBX6513DSVTM"), "HBX-6513DS")

    # --- Kathrein ---

    def test_kathrein_numeric(self):
        self.assertEqual(_normalise_antenna_type("KATHREIN 739650"), "739650")
        self.assertEqual(_normalise_antenna_type("Antenna Sectoral 739650 Kathrein"), "739650")

    def test_kathrein_k_prefix(self):
        self.assertEqual(_normalise_antenna_type("K739650"), "739650")
        self.assertEqual(_normalise_antenna_type("K739650 High Band"), "739650")

    def test_kathrein_underscore(self):
        self.assertEqual(_normalise_antenna_type("Kathrein_730382"), "730382")

    def test_kathrein_8digit(self):
        self.assertEqual(_normalise_antenna_type("KATHREIN 80010213"), "80010213")

    # --- Argus ---

    def test_cnpx_410_14m(self):
        self.assertEqual(_normalise_antenna_type("ANDREW CNPX-410-14M"), "CNPX-410-14M")
        self.assertEqual(
            _normalise_antenna_type("Antenna Sectoral CNPX-410-14M Commscope"),
            "CNPX-410-14M",
        )

    def test_cnpx_410_14m_4p_e1(self):
        self.assertEqual(
            _normalise_antenna_type("CNPX410.14M-4P-E1"),
            "CNPX-410-14M-4P-E1",
        )

    def test_npx412m(self):
        self.assertEqual(_normalise_antenna_type("ARGUS NPX412M-E1"), "NPX412M-E1")

    # --- Anatel ---

    def test_hg2412p(self):
        self.assertEqual(_normalise_antenna_type("ANATEL HG2412P-180"), "HG2412P-180")
        self.assertEqual(
            _normalise_antenna_type("Antenna Sectoral HG2412P-180 Anatel"),
            "HG2412P-180",
        )

    # --- Edge cases ---

    def test_none_returns_none(self):
        self.assertIsNone(_normalise_antenna_type(None))

    def test_empty_returns_none(self):
        self.assertIsNone(_normalise_antenna_type(""))
        self.assertIsNone(_normalise_antenna_type("   "))

    def test_just_vendor_returns_none(self):
        self.assertIsNone(_normalise_antenna_type("KATHREIN"))
        self.assertIsNone(_normalise_antenna_type("Huawei"))

    def test_just_descriptor_returns_none(self):
        self.assertIsNone(_normalise_antenna_type("Antenna Sectoral"))
        self.assertIsNone(_normalise_antenna_type("Antenna RF"))

    def test_misspelled_vendor(self):
        self.assertEqual(_normalise_antenna_type("KATHERIN 739650"), "739650")
        self.assertEqual(_normalise_antenna_type("Kathrein 739650"), "739650")


class TestFreqRangeToBand(unittest.TestCase):
    """Tests for the freq_range_to_band conversion in load_antenna_specs.py."""

    def setUp(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        from load_antenna_specs import freq_range_to_band
        self.freq_range_to_band = freq_range_to_band

    def test_900_band(self):
        self.assertEqual(self.freq_range_to_band("880-960"), 900)
        self.assertEqual(self.freq_range_to_band("806-880"), 900)
        self.assertEqual(self.freq_range_to_band("824-894"), 900)

    def test_1800_band(self):
        self.assertEqual(self.freq_range_to_band("1710-1880"), 1800)
        self.assertEqual(self.freq_range_to_band("1710-1990"), 1800)

    def test_2100_band(self):
        self.assertEqual(self.freq_range_to_band("1920-2200"), 2100)
        self.assertEqual(self.freq_range_to_band("1920-2170"), 2100)

    def test_2300_band(self):
        self.assertEqual(self.freq_range_to_band("2200-2490"), 2300)
        self.assertEqual(self.freq_range_to_band("2490-2690"), 2300)
        self.assertEqual(self.freq_range_to_band("2300-2690"), 2300)

    def test_outside_bands_returns_none(self):
        self.assertIsNone(self.freq_range_to_band("3300-3800"))
        self.assertIsNone(self.freq_range_to_band("690-803"))

    def test_invalid_format_returns_none(self):
        self.assertIsNone(self.freq_range_to_band("invalid"))
        self.assertIsNone(self.freq_range_to_band(""))


class TestConvertBandDict(unittest.TestCase):
    """Tests for convert_band_dict in load_antenna_specs.py."""

    def setUp(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        from load_antenna_specs import convert_band_dict
        self.convert_band_dict = convert_band_dict

    def test_simple_mapping(self):
        raw = {"880-960": 17.0, "1710-1880": 18.0}
        result = self.convert_band_dict(raw)
        self.assertEqual(result.get("900"), 17.0)
        self.assertEqual(result.get("1800"), 18.0)

    def test_multiple_subbands_same_band(self):
        raw = {"806-880": 16.65, "880-960": 17.15}
        result = self.convert_band_dict(raw)
        self.assertEqual(len(result), 1)
        self.assertIn("900", result)

    def test_empty_dict(self):
        self.assertEqual(self.convert_band_dict({}), {})

    def test_none_values_skipped(self):
        raw = {"880-960": None, "1710-1880": 18.0}
        result = self.convert_band_dict(raw)
        self.assertEqual(result.get("900"), None)
        self.assertEqual(result.get("1800"), 18.0)


class TestModelFields(unittest.TestCase):
    """Tests for Pydantic model field validation."""

    def test_tilt_analysis_request_has_antenna_type(self):
        from models.rf_tilt import TiltAnalysisRequest
        req = TiltAnalysisRequest(
            latitude=0, longitude=0, azimuth=0,
            antenna_height=30, vertical_beamwidth=7.0,
            antenna_type="APE4516R1v06",
        )
        self.assertEqual(req.antenna_type, "APE4516R1v06")

    def test_tilt_analysis_request_antenna_type_optional(self):
        from models.rf_tilt import TiltAnalysisRequest
        req = TiltAnalysisRequest(
            latitude=0, longitude=0, azimuth=0,
            antenna_height=30, vertical_beamwidth=7.0,
        )
        self.assertIsNone(req.antenna_type)

    def test_antenna_reference_model(self):
        from models.rf_tilt import AntennaReference
        ref = AntennaReference(
            frequency_mhz=1800,
            gain_dbi=17.5,
            matched=True,
            match_method="exact",
        )
        self.assertTrue(ref.matched)
        self.assertEqual(ref.match_method, "exact")
        self.assertEqual(ref.gain_dbi, 17.5)

    def test_antenna_spec_response_model(self):
        from models.rf_tilt import AntennaSpecResponse
        spec = AntennaSpecResponse(
            antenna_model="APE4516R1",
            vendor="Huawei",
            gain_dbi_by_band={"900": 16.1, "1800": 15.8},
            horizontal_beamwidth=67,
            matched=True,
            match_method="exact",
        )
        self.assertEqual(spec.antenna_model, "APE4516R1")
        self.assertEqual(spec.gain_dbi_by_band["900"], 16.1)


if __name__ == "__main__":
    unittest.main()
