"""Check exact column names for query alignment."""
import asyncio
from sqlalchemy import text
from database import engine

async def main():
    async with engine.connect() as conn:
        # All columns in data_site_master
        r = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name='data_site_master' ORDER BY ordinal_position"
        ))
        print("=== data_site_master columns ===")
        for row in r.all():
            print(f"  {row[0]}")

        # All columns in availability_logs_jatim
        r2 = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name='availability_logs_jatim' ORDER BY ordinal_position"
        ))
        print("\n=== availability_logs_jatim columns ===")
        for row in r2.all():
            print(f"  {row[0]}")

        # Sample data from availability_logs_jatim
        r3 = await conn.execute(text(
            'SELECT DISTINCT "Bulan", "Tahun" FROM availability_logs_jatim ORDER BY "Tahun" DESC, "Bulan" DESC LIMIT 5'
        ))
        print("\n=== Available periods ===")
        for row in r3.all():
            print(f"  Bulan={row[0]}, Tahun={row[1]}")

asyncio.run(main())
