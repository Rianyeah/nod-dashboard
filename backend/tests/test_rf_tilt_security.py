import pytest
from pydantic import ValidationError

from models.rf_tilt import TiltAnalysisRequest


@pytest.mark.parametrize(
    ("field", "value"),
    (
        ("latitude", 91),
        ("longitude", 181),
        ("max_distance", 50_001),
        ("sample_interval", 9.9),
    ),
)
def test_rf_request_rejects_out_of_bounds_values(valid_payload, field, value):
    with pytest.raises(ValidationError):
        TiltAnalysisRequest(**{**valid_payload, field: value})


def test_rf_request_rejects_more_than_200_clutter_points(valid_payload):
    with pytest.raises(ValidationError):
        TiltAnalysisRequest(
            **{**valid_payload, "clutter": [{"distance": 1, "height": 1}] * 201}
        )


def test_rf_target_coordinates_must_be_provided_together(valid_payload):
    with pytest.raises(ValidationError):
        TiltAnalysisRequest(**{**valid_payload, "target_latitude": -7.2})
