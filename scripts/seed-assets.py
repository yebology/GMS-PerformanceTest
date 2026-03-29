import boto3
import uuid
import argparse
from datetime import datetime, timezone
from decimal import Decimal

TABLE_NAME = "gms-dev-assets"
dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")
table = dynamodb.Table(TABLE_NAME)

CATEGORIES = ["LAPTOP", "MOBILE_PHONE", "TABLET", "OTHERS"]
BRANDS = ["Lenovo", "Dell", "HP", "Apple", "Samsung", "Asus"]
STATUSES = ["IN_STOCK", "ASSIGNED", "ASSET_PENDING_APPROVAL", "DAMAGED"]


def generate_asset(index: int) -> dict:
    asset_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    category = CATEGORIES[index % len(CATEGORIES)]
    brand = BRANDS[index % len(BRANDS)]
    status = STATUSES[index % len(STATUSES)]
    serial = f"TEST-SN-{index:06d}"

    return {
        "PK": f"ASSET#{asset_id}",
        "SK": "METADATA",
        "Brand": brand,
        "Model": f"TestModel-{index}",
        "SerialNumber": serial,
        "Category": category,
        "Status": status,
        "Cost": Decimal(str(round(500 + (index * 10.5), 2))),
        "CreatedAt": now,
        "EntityType": "ASSET",
        "StatusIndexPK": f"STATUS#{status}",
        "StatusIndexSK": f"ASSET#{asset_id}",
        "SerialNumberIndexPK": f"SERIAL#{serial}",
        "SerialNumberIndexSK": "METADATA",
        "IsTestData": True,
    }


def seed(count: int):
    print(f"Seeding {count} test assets...")
    with table.batch_writer() as batch:
        for i in range(count):
            item = generate_asset(i)
            batch.put_item(Item=item)
            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{count} seeded")
    print(f"Done. {count} test assets seeded.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("count", type=int, help="Number of assets to seed")
    args = parser.parse_args()
    seed(args.count)
