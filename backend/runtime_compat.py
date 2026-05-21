import platform
import sys


if sys.platform.startswith("win"):
    # Python 3.14's platform.machine()/uname() can hang on this Windows
    # environment while importing SQLAlchemy/asyncpg. They only need stable OS
    # and architecture labels during import.
    platform.machine = lambda: "AMD64"
    platform.uname = lambda: platform.uname_result(
        "Windows",
        "",
        "",
        "",
        "AMD64",
    )
